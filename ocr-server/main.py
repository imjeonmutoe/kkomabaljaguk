import os
import re
import base64
import json
from datetime import datetime, timezone
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, File, UploadFile, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth

from ocr.processor import extract
from ocr.naver_shop import search_naver_products

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

FRONTEND_ORIGINS = [
    o.strip()
    for o in os.getenv('FRONTEND_ORIGIN', 'https://your-app.vercel.app').split(',')
] + ['http://localhost:5173', 'http://localhost:3000']
MAX_IMAGE_BYTES = int(os.getenv('MAX_IMAGE_MB', '5')) * 1024 * 1024

# ── Firebase Admin init ───────────────────────────────────────────────────────
# Uses GOOGLE_APPLICATION_CREDENTIALS_JSON (plain JSON string) if present,
# then FIREBASE_CREDENTIALS (base64-encoded), then ADC fallback.

_cred_json = (
    os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')
    or os.getenv('GOOGLE_APPLICATION_CREDENTIALS_JSON')
    or ''
)
_cred_b64 = os.getenv('FIREBASE_CREDENTIALS', '')
_firebase_options = {'projectId': 'kkomabaljaguk'}
if _cred_json:
    _cred_dict = json.loads(_cred_json)
    firebase_admin.initialize_app(credentials.Certificate(_cred_dict), _firebase_options)
elif _cred_b64:
    _cred_dict = json.loads(base64.b64decode(_cred_b64).decode('utf-8'))
    firebase_admin.initialize_app(credentials.Certificate(_cred_dict), _firebase_options)
else:
    # Fallback: Application Default Credentials (Cloud Run default SA)
    firebase_admin.initialize_app(options=_firebase_options)

_db = firestore.client()

# ── App ───────────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title='꼬마발자국 OCR Server', version='2.0.0', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_origin_regex=r'https://.*\.vercel\.app',
    allow_methods=['GET', 'POST'],
    allow_headers=['*'],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    print(f'[server] unhandled exception: {type(exc).__name__}: {exc}')
    origin = request.headers.get('origin', '')
    headers = {'Access-Control-Allow-Origin': origin} if origin else {}
    return JSONResponse(status_code=500, content={'detail': 'Internal server error'}, headers=headers)

# ── Endpoints ─────────────────────────────────────────────────────────────────


@app.get('/health')
async def health() -> dict:
    return {
        'status': 'ok',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }


@app.post('/ocr')
async def run_ocr(file: UploadFile = File(...)) -> dict:
    """
    Accept a multipart image upload, run OCR, search Naver Shopping,
    and save a pending deal document to Firestore.

    Returns: { ok, docId, data: extract_result, naverCount }
    """
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail='이미지 파일만 업로드 가능해요.')

    image_bytes = await file.read()
    if len(image_bytes) > MAX_IMAGE_BYTES:
        mb = MAX_IMAGE_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f'파일 크기는 {mb}MB 이하여야 해요.')

    # OCR pipeline
    data = await extract(image_bytes)

    # Naver Shopping — only when a product name was detected
    naver_products: list[dict] = []
    if data.get('productName'):
        naver_products = await search_naver_products(str(data['productName']))

    # Persist to Firestore as a pending deal
    doc_ref = _db.collection('deals').document()
    doc_ref.set({
        # OCR fields
        'productName': data.get('productName') or '',
        'startAt': data.get('startAt'),          # "YYYY-MM-DD" or None
        'endAt': data.get('endAt'),              # "YYYY-MM-DD" or None
        'price': data.get('price') or 0,
        'rawText': data.get('rawText') or '',
        'confidence': data.get('confidence') or 0.0,
        # Naver
        'naverProducts': naver_products,
        'naverUpdatedAt': firestore.SERVER_TIMESTAMP,
        # Defaults — admin fills in the rest during review
        'brand': '',
        'category': '기타',
        'instagramUrl': '',
        'oembedHtml': '',
        'reporterId': '',
        'viewCount': 0,
        # Status
        'status': 'pending',
        'createdAt': firestore.SERVER_TIMESTAMP,
    })

    return {
        'ok': True,
        'docId': doc_ref.id,
        'data': data,
        'naverCount': len(naver_products),
    }


class ParseUrlRequest(BaseModel):
    url: str


class NaverRefreshRequest(BaseModel):
    dealId: str
    productName: str


@app.post('/naver-refresh')
async def naver_refresh(
    body: NaverRefreshRequest,
    authorization: str = Header(...),
) -> dict:
    """
    Re-fetch Naver Shopping products for a deal and update Firestore.
    Requires a valid Firebase ID token with admin custom claim.

    Returns: { ok, products }
    """
    # Verify Firebase ID token — must carry admin custom claim
    raw_token = authorization.removeprefix('Bearer ').strip()
    if not raw_token:
        raise HTTPException(status_code=401, detail='Authorization 헤더가 없어요.')

    try:
        decoded = fb_auth.verify_id_token(raw_token)
    except Exception:
        raise HTTPException(status_code=401, detail='인증에 실패했어요.')

    if not decoded.get('admin'):
        raise HTTPException(status_code=403, detail='관리자 권한이 필요해요.')

    # Fetch fresh products
    products = await search_naver_products(body.productName)

    # Update the deal document
    deal_ref = _db.collection('deals').document(body.dealId)
    if not deal_ref.get().exists:
        raise HTTPException(status_code=404, detail='해당 딜을 찾을 수 없어요.')

    deal_ref.update({
        'naverProducts': products,
        'naverUpdatedAt': firestore.SERVER_TIMESTAMP,
    })

    return {'ok': True, 'products': products}


# ── Inpock parsing ────────────────────────────────────────────────────────────

_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; KkomaBaljaguk/1.0)',
    'Accept-Language': 'ko-KR,ko;q=0.9',
}


def _extract_og(html: str, property: str) -> str:
    """Extract a single og: meta content value from HTML."""
    m = re.search(
        rf'<meta[^>]+property=["\']og:{property}["\'][^>]+content=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    )
    if not m:
        # also handle content-first attribute ordering
        m = re.search(
            rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:{property}["\']',
            html,
            re.IGNORECASE,
        )
    return m.group(1) if m else ''


@app.post('/parse-inpock')
async def parse_inpock(body: ParseUrlRequest) -> list:
    """
    Fetch an inpock.co.kr page, parse __NEXT_DATA__, and return deal blocks
    that appear after the '공구OPEN' label section.

    Returns a list of:
      { title, image, url, open_at, open_until }
    """
    url = body.url.strip()
    if 'link.inpock.co.kr' not in url:
        raise HTTPException(status_code=400, detail='인포크 링크가 아니에요.')

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        try:
            resp = await client.get(url, headers=_HEADERS)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f'인포크 페이지를 불러올 수 없어요: {e}')

    html = resp.text

    # Extract __NEXT_DATA__ JSON from script tag
    m = re.search(
        r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
        html,
        re.DOTALL,
    )
    if not m:
        raise HTTPException(status_code=422, detail='__NEXT_DATA__를 찾을 수 없어요.')

    try:
        next_data: dict = json.loads(m.group(1))
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail='__NEXT_DATA__ 파싱에 실패했어요.')

    blocks: list[dict] = (
        next_data
        .get('props', {})
        .get('pageProps', {})
        .get('blocks', [])
    )

    # Find the index of the '공구OPEN' label block (handles spaces between chars)
    open_idx = None
    for i, block in enumerate(blocks):
        title: str = block.get('title', '') or ''
        btype: str = block.get('block_type', '') or ''
        if btype == 'label' and re.search(r'공\s*구\s*O\s*P\s*E\s*N', title, re.IGNORECASE):
            open_idx = i
            break

    if open_idx is None:
        # No label found — return all link blocks as fallback
        link_blocks = [b for b in blocks if b.get('block_type') == 'link']
    else:
        # Collect link blocks after the label; stop at the next label
        link_blocks = []
        for block in blocks[open_idx + 1:]:
            btype = block.get('block_type', '')
            if btype == 'label':
                break
            if btype == 'link':
                link_blocks.append(block)

    async def _resolve_image(block: dict) -> str | None:
        raw_img: str = block.get('image') or ''
        block_url: str = block.get('url') or ''

        # Already an absolute URL
        if raw_img.startswith('http://') or raw_img.startswith('https://'):
            return raw_img
        # Protocol-relative → normalise to https
        if raw_img.startswith('//'):
            return 'https:' + raw_img
        # Relative path — fetch block.url and extract og:image
        if raw_img and block_url:
            try:
                async with httpx.AsyncClient(follow_redirects=True, timeout=5) as c:
                    r = await c.get(block_url, headers=_HEADERS)
                    r.raise_for_status()
                og = _extract_og(r.text, 'image')
                if og:
                    return 'https:' + og if og.startswith('//') else og
            except Exception:
                pass
        return None

    results = []
    for block in link_blocks:
        image = await _resolve_image(block)
        results.append({
            'title': block.get('title') or '',
            'image': image,
            'url': block.get('url') or '',
            'open_at': block.get('open_at'),
            'open_until': block.get('open_until'),
        })
    return results


# ── Srookpay / srok.kr parsing ────────────────────────────────────────────────

@app.post('/parse-srookpay')
async def parse_srookpay(body: ParseUrlRequest) -> dict:
    """
    Fetch a srookpay or srok.kr product page and return:
      { productName, thumbnailUrl, price, originalPrice }

    Follows redirects automatically (srok.kr short links resolve to shop.srookpay.com).
    """
    url = body.url.strip()
    if not any(d in url for d in ('shop.srookpay.com', 'srok.kr')):
        raise HTTPException(status_code=400, detail='스룩페이 링크가 아니에요.')

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        try:
            resp = await client.get(url, headers=_HEADERS)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f'스룩페이 페이지를 불러올 수 없어요: {e}')

    html = resp.text

    product_name = _extract_og(html, 'title')
    thumbnail_url = _extract_og(html, 'image')
    description = _extract_og(html, 'description')

    # Extract sale price — try common label patterns first, then JSON-LD
    price = ''
    for pattern in (
        r'공구가[^0-9]*([0-9,]+)\s*원',
        r'판매가[^0-9]*([0-9,]+)\s*원',
        r'할인가[^0-9]*([0-9,]+)\s*원',
        r'"price"\s*:\s*"?([0-9,]+)"?',
    ):
        pm = re.search(pattern, html)
        if pm:
            price = pm.group(1).replace(',', '') + '원'
            break

    # Extract original price
    original_price = ''
    for pattern in (
        r'정가[^0-9]*([0-9,]+)\s*원',
        r'소비자가[^0-9]*([0-9,]+)\s*원',
        r'원가[^0-9]*([0-9,]+)\s*원',
    ):
        pm = re.search(pattern, html)
        if pm:
            original_price = pm.group(1).replace(',', '') + '원'
            break

    return {
        'productName': product_name,
        'thumbnailUrl': thumbnail_url,
        'price': price,
        'originalPrice': original_price,
        'description': description,
    }