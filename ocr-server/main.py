import os
import base64
import json
from datetime import datetime, timezone
from contextlib import asynccontextmanager

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

_cred_json = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_JSON', '')
_cred_b64 = os.getenv('FIREBASE_CREDENTIALS', '')
if _cred_json:
    _cred_dict = json.loads(_cred_json)
    firebase_admin.initialize_app(credentials.Certificate(_cred_dict))
elif _cred_b64:
    _cred_dict = json.loads(base64.b64decode(_cred_b64).decode('utf-8'))
    firebase_admin.initialize_app(credentials.Certificate(_cred_dict))
else:
    # Fallback: Application Default Credentials (Cloud Run default SA)
    firebase_admin.initialize_app()

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
    return JSONResponse(status_code=500, content={'detail': 'Internal server error'})

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