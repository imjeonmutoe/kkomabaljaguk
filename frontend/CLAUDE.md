# Frontend — 꼬마발자국

## 코딩 규칙
- 컴포넌트: PascalCase (DealCard.jsx)
- 훅: camelCase + use 접두사 (useDeals.js)
- 상수: UPPER_SNAKE_CASE
- UI 문자열: 한국어, 코드 주석: 영어

## CSS 규칙 — Tailwind CSS 사용
- 인라인 일반 CSS 금지, 반드시 Tailwind 클래스만 사용
- 모바일 우선: 기본값이 모바일, sm: md: lg: 순으로 확장
- 자주 쓰는 패턴은 컴포넌트로 추출 (중복 클래스 지양)
- 커스텀 색상은 tailwind.config.js에 정의 후 사용
- 주요 색상: primary #F97316 (오렌지), primary-dark #EA580C, cream #FFF7ED (베이지 배경)
- 예시: <div className="flex flex-col gap-4 p-4 rounded-xl bg-white shadow-sm">

## 컴포넌트 작성 원칙
- named export 사용 (default export 금지)
- props에 JSDoc 타입 주석 작성
- 에러 상태와 로딩 상태 항상 처리
- 모바일 우선 (기본이 모바일, sm: 이상에서 데스크탑 대응)

## 광고 컴포넌트 규칙
- AdSenseUnit: 타임라인 3번째 카드마다, 상세 상단
- AdfitUnit: 상세 페이지 하단만 (AdSense와 영역 분리)
- NaverProducts: [광고] 배지 없으면 렌더링 금지
- 광고 로드 실패 시 빈 공간 없이 자동 숨김 처리

## 성능 규칙
- oEmbed 결과: sessionStorage 24h 캐싱 필수
- naverProducts: Firestore 저장값 사용 (매 렌더링마다 API 호출 금지)
- DealCard: React.memo 래핑
- 이미지: loading="lazy" 필수

## 현재 작업 컨텍스트
- 상태: 초기 개발
- 진행 중: -
- 다음 작업: -
- 블로커: Firebase 프로젝트 생성, 네이버 API 키 발급 필요
