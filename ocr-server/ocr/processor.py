import re
import os
import json
import asyncio
from typing import Any

from google.cloud import vision
from google.oauth2 import service_account

_CONFIDENCE_MIN = float(os.getenv('OCR_CONFIDENCE_MIN', '0.7'))

_DATE_RE = re.compile(r'(\d{1,2})[/\.\월]\s*(\d{1,2})')
_PRICE_RE = re.compile(r'(\d{1,3}(?:,\d{3})*)\s*원')
_BRAND_RE = re.compile(r'@\S+|[A-Z]{2,}(?:\s+[A-Z]+)*')

_YEAR = 2026


def _build_client() -> vision.ImageAnnotatorClient:
    # FIREBASE_CREDENTIALS: base64-encoded service account JSON (Cloud Run env var)
    creds_b64 = os.getenv('FIREBASE_CREDENTIALS', '')
    if creds_b64:
        import base64
        info: dict[str, Any] = json.loads(base64.b64decode(creds_b64).decode('utf-8'))
        creds = service_account.Credentials.from_service_account_info(
            info,
            scopes=['https://www.googleapis.com/auth/cloud-vision'],
        )
        return vision.ImageAnnotatorClient(credentials=creds)
    # Fallback: Application Default Credentials (local dev / Cloud Run default SA)
    return vision.ImageAnnotatorClient()


def _run_ocr(image_bytes: bytes) -> dict[str, Any]:
    """Synchronous Vision API call — executed in a thread pool by extract()."""
    try:
        client = _build_client()
        image = vision.Image(content=image_bytes)
        response = client.document_text_detection(image=image)
        if response.error.message:
            print(f'[processor] Vision API error: {response.error.message}')
            return {}
    except Exception as exc:
        print(f'[processor] client error: {exc}')
        return {}

    full_text = response.full_text_annotation
    if not full_text:
        return {}

    # Collect words that meet the confidence threshold
    accepted: list[str] = []
    for page in full_text.pages:
        for block in page.blocks:
            for paragraph in block.paragraphs:
                for word in paragraph.words:
                    if word.confidence < _CONFIDENCE_MIN:
                        continue
                    accepted.append(''.join(s.text for s in word.symbols))

    if not accepted:
        return {}

    raw_text = ' '.join(accepted)

    # Product name: first accepted token
    product_name: str = accepted[0].strip()

    # Brand: @handle or consecutive ALL-CAPS Latin tokens
    brand: str = ''
    brand_match = _BRAND_RE.search(raw_text)
    if brand_match:
        brand = brand_match.group(0).strip()

    # Date extraction — up to two dates (startAt / endAt)
    date_matches = _DATE_RE.findall(raw_text)
    start_at: str = ''
    end_at: str = ''
    if len(date_matches) >= 2:
        m1, d1 = date_matches[0]
        m2, d2 = date_matches[1]
        start_at = f'{_YEAR}-{int(m1):02d}-{int(d1):02d}'
        end_at = f'{_YEAR}-{int(m2):02d}-{int(d2):02d}'
    elif len(date_matches) == 1:
        m1, d1 = date_matches[0]
        start_at = f'{_YEAR}-{int(m1):02d}-{int(d1):02d}'

    # Price extraction — first match wins
    price: int = 0
    price_match = _PRICE_RE.search(raw_text)
    if price_match:
        price = int(price_match.group(1).replace(',', ''))

    return {
        'productName': product_name,
        'brand': brand,
        'startAt': start_at,
        'endAt': end_at,
        'price': price,
    }


async def extract(image_bytes: bytes) -> dict[str, Any]:
    """
    Run Google Cloud Vision OCR on raw image bytes.

    Returns:
        {
            productName: str,
            brand:       str,
            startAt:     str,   # "YYYY-MM-DD" or ""
            endAt:       str,   # "YYYY-MM-DD" or ""
            price:       int,   # 0 if not found
        }
    Never raises — returns empty dict on any failure.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run_ocr, image_bytes)