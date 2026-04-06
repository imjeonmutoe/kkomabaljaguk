import re
import os
import httpx

NAVER_CLIENT_ID = os.getenv('NAVER_CLIENT_ID', '')
NAVER_CLIENT_SECRET = os.getenv('NAVER_CLIENT_SECRET', '')
NAVER_SHOP_URL = 'https://openapi.naver.com/v1/search/shop.json'

_TAG_RE = re.compile('<[^>]+>')


def _strip_html(text: str) -> str:
    """Remove HTML tags that Naver injects into title strings."""
    return _TAG_RE.sub('', text)


async def search_naver_products(
    query: str,
    limit: int = 3,
) -> list[dict]:
    """
    Search Naver Shopping API and return a normalized product list.

    Always returns [] on any failure — callers must not depend on products
    being present (OCR result is still useful without them).

    Returns list of:
        { title: str, link: str, image: str, lprice: int, mallName: str }
    """
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        print('[naver_shop] API credentials missing — skipping product search')
        return []

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                NAVER_SHOP_URL,
                params={'query': query, 'display': limit, 'sort': 'sim'},
                headers={
                    'X-Naver-Client-Id': NAVER_CLIENT_ID,
                    'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
                },
            )

        if resp.status_code != 200:
            print(f'[naver_shop] API error: HTTP {resp.status_code}')
            return []

        items: list[dict] = resp.json().get('items', [])
        return [
            {
                'title': _strip_html(item.get('title', '')),
                'link': item.get('link', ''),
                'image': item.get('image', ''),
                'lprice': int(item.get('lprice', 0) or 0),
                'mallName': item.get('mallName', ''),
            }
            for item in items
        ]
    except Exception as e:
        print(f'[naver_shop] search error: {e}')
        return []