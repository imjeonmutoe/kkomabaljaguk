# OCR Server — 꼬마발자국

## 기술 스택
- Python 3.11 + FastAPI + Uvicorn
- EasyOCR (한국어 + 영어 모델)
- 배포: Railway (무료 500시간/월)

## 코딩 규칙
- 함수명: snake_case
- 클래스명: PascalCase
- 타입 힌트 필수 (모든 함수 파라미터 + 반환값)
- async/await 사용 (동기 함수 금지)
- 에러는 return [] / return None으로 처리 (raise 최소화 — OCR 실패가 전체 서버를 중단하면 안 됨)

## EasyOCR 규칙
- reader는 모듈 레벨 싱글턴 — 절대 함수 안에서 초기화 금지 (매우 느림)
- 신뢰도 0.7 미만 토큰 무시
- gpu=False 고정 (Railway 무료 플랜 GPU 없음)

## 네이버 API 규칙
- search_naver_products()는 항상 빈 리스트 반환 가능하게 설계
- HTML 태그 제거 필수: re.sub('<[^>]+>', '', title)
- API 실패 시 로그만 남기고 OCR 결과는 정상 반환

## 현재 작업 컨텍스트
- 상태: 초기 개발
- 진행 중: -
- 다음 작업: -
- 블로커: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 발급 필요
