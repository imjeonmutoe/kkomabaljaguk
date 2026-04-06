import re
import io
import os
import numpy as np
import cv2
from PIL import Image, ImageFilter
import easyocr

# ── Singleton reader — never initialize inside a function (model load is ~10s) ─
reader = easyocr.Reader(['ko', 'en'], gpu=False)

CONFIDENCE_MIN = float(os.getenv('OCR_CONFIDENCE_MIN', '0.7'))

_DATE_RE = re.compile(r'(\d{1,2})[/\.\월]\s*(\d{1,2})')
_PRICE_RE = re.compile(r'(\d{1,3}(?:,\d{3})*)\s*원')

# Current year for date construction — update if deploying across a year boundary
_YEAR = 2026


def _preprocess(image_bytes: bytes) -> np.ndarray:
    """
    Grayscale → Otsu binarization → 2× upscale (Lanczos) → sharpen.
    Returns a numpy uint8 array suitable for easyocr.readtext().
    """
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')

    # Grayscale
    gray = img.convert('L')

    # 2× upscale with Lanczos for better OCR on small text
    w, h = gray.size
    gray = gray.resize((w * 2, h * 2), Image.LANCZOS)

    # Sharpen
    gray = gray.filter(ImageFilter.SHARPEN)

    # Otsu binarization via OpenCV
    arr = np.array(gray, dtype=np.uint8)
    _, binary = cv2.threshold(arr, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return binary


def extract(image_bytes: bytes) -> dict:
    """
    Run the full OCR pipeline on raw image bytes.

    Returns:
        {
            productName: str | None,   # first high-confidence text token
            startAt:     str | None,   # "YYYY-MM-DD"
            endAt:       str | None,   # "YYYY-MM-DD" (second date if found)
            price:       int | None,   # numeric price value
            rawText:     str,          # full concatenated accepted text
            confidence:  float,        # mean confidence of accepted tokens
        }
    Never raises — returns partial result on any OCR failure.
    """
    try:
        arr = _preprocess(image_bytes)
        results: list[tuple[list, str, float]] = reader.readtext(
            arr,
            detail=1,
            paragraph=False,
        )
    except Exception as e:
        print(f'[processor] readtext error: {e}')
        results = []

    # Filter by confidence threshold
    accepted = [(text, conf) for (_bbox, text, conf) in results if conf >= CONFIDENCE_MIN]

    raw_text = ' '.join(text for text, _ in accepted)
    confidence = (
        round(sum(conf for _, conf in accepted) / len(accepted), 3)
        if accepted else 0.0
    )

    # Product name: first accepted token by OCR position
    product_name: str | None = accepted[0][0].strip() if accepted else None

    # Date extraction — up to two dates
    date_matches = _DATE_RE.findall(raw_text)
    start_at: str | None = None
    end_at: str | None = None
    if len(date_matches) >= 2:
        m1, d1 = date_matches[0]
        m2, d2 = date_matches[1]
        start_at = f'{_YEAR}-{int(m1):02d}-{int(d1):02d}'
        end_at = f'{_YEAR}-{int(m2):02d}-{int(d2):02d}'
    elif len(date_matches) == 1:
        m1, d1 = date_matches[0]
        start_at = f'{_YEAR}-{int(m1):02d}-{int(d1):02d}'

    # Price extraction — first match wins
    price: int | None = None
    price_match = _PRICE_RE.search(raw_text)
    if price_match:
        price = int(price_match.group(1).replace(',', ''))

    return {
        'productName': product_name,
        'startAt': start_at,
        'endAt': end_at,
        'price': price,
        'rawText': raw_text,
        'confidence': confidence,
    }