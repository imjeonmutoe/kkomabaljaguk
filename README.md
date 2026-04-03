# 꼬마발자국 (KkomaBaljaguk)

육아 인플루언서 공구 일정 알림 React PWA — v2.0

## 프로젝트 개요

육아 인플루언서들이 진행하는 공동구매(공구) 일정을 한눈에 확인하고, 알림을 받을 수 있는 PWA 서비스입니다.

- 공구 일정 타임라인 조회 (카테고리·날짜 필터)
- 인스타그램 게시물 oEmbed 미리보기
- 공구 시작 알림 (Firebase FCM 푸시)
- 네이버 쇼핑 관련 상품 연동
- 사용자 제보 → 관리자 승인 후 공개

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| PWA | vite-plugin-pwa (Workbox) |
| Backend | Firebase (Firestore, Anonymous Auth, FCM, Storage) |
| OCR Server | Python 3.11 + FastAPI + EasyOCR → Railway |
| 배포 | Vercel (frontend), Railway (OCR server) |
| 수익화 | Google AdSense, 카카오 애드핏, 네이버 쇼핑 파트너스 |

---

## 시작하기

### 1. 저장소 클론

```bash
git clone https://github.com/your-org/kkomabaljaguk.git
cd kkomabaljaguk
```

### 2. 프론트엔드 설치 및 실행

```bash
cd frontend
npm install
cp .env.example .env       # 환경변수 채우기 (아래 Firebase 설정 참고)
npm run dev                 # http://localhost:5173
```

### 3. OCR 서버 설치 및 실행 (선택)

```bash
cd ocr-server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # 환경변수 채우기
uvicorn main:app --reload   # http://localhost:8000
```

---

## 환경변수 설정

### frontend/.env

```
# Firebase
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=

# Instagram oEmbed (선택 — 없으면 공개 엔드포인트 사용)
VITE_OEMBED_TOKEN=

# OCR 서버 URL (Railway 배포 후 입력)
VITE_OCR_SERVER_URL=https://your-app.railway.app

# Google AdSense
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
VITE_ADSENSE_SLOT_TIMELINE=XXXXXXXXXX
VITE_ADSENSE_SLOT_DETAIL=XXXXXXXXXX

# 카카오 애드핏
VITE_ADFIT_UNIT_ID=DAN-XXXXXXXXXXXXXXXXXX
```

### ocr-server/.env

```
FIREBASE_CREDENTIALS=   # base64 인코딩된 서비스 계정 JSON
FIREBASE_PROJECT_ID=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
FRONTEND_ORIGIN=https://your-app.vercel.app
```

---

## Firebase 프로젝트 설정

1. [Firebase 콘솔](https://console.firebase.google.com)에서 새 프로젝트 생성
2. **Authentication** → 로그인 방법 → **익명** 사용 설정
3. **Firestore Database** → 프로덕션 모드로 생성 → `firestore.rules` 배포
   ```bash
   firebase deploy --only firestore:rules
   ```
4. **Cloud Messaging** → 웹 푸시 인증서(VAPID 키) 생성 → `VITE_FIREBASE_VAPID_KEY`에 입력
5. **프로젝트 설정** → 일반 → 웹 앱 추가 → 구성값을 `.env`에 입력

---

## 배포

### Vercel (Frontend)

```bash
cd frontend
npm run build              # dist/ 생성 확인
vercel --prod              # 또는 GitHub 연동 자동 배포
```

Vercel 대시보드에서 환경변수(`VITE_*`)를 모두 추가하세요.

### Railway (OCR Server)

1. [Railway](https://railway.app)에서 새 프로젝트 → GitHub 연결 (`ocr-server/` 폴더)
2. 환경변수 (`FIREBASE_CREDENTIALS`, `NAVER_CLIENT_ID` 등) 입력
3. `railway.json`이 자동으로 빌드/시작 명령을 설정합니다

---

## 광고 플랫폼 설정

### Google AdSense

1. [AdSense 콘솔](https://www.google.com/adsense) → 사이트 추가 → 심사 통과
2. 광고 → 광고 단위 → 디스플레이 광고 2개 생성 (타임라인용, 상세 페이지용)
3. `data-ad-client` → `VITE_ADSENSE_CLIENT`, 각 슬롯 ID → `VITE_ADSENSE_SLOT_*`

### 카카오 애드핏

1. [애드핏 콘솔](https://adfit.kakao.com) → 광고단위 관리 → 신규 광고단위 생성
2. 단위 ID → `VITE_ADFIT_UNIT_ID`

### 네이버 쇼핑 파트너스

1. [네이버 개발자 센터](https://developers.naver.com) → 애플리케이션 등록 → 검색 API 신청
2. Client ID / Secret → `ocr-server/.env`의 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
3. [네이버 파트너스퀘어](https://partner.naver.com) → 쇼핑 파트너스 가입 → 링크 변환 설정

---

## 프로젝트 구조

```
kkomabaljaguk/
├── frontend/
│   ├── src/
│   │   ├── pages/       # Timeline, DealDetail, Report, Admin, Privacy, Terms
│   │   ├── components/  # DealCard, NaverProducts, OEmbed, AdSenseUnit, AdfitUnit, PushConsent
│   │   ├── hooks/       # useDeals, useFCM, useAnalytics
│   │   └── lib/         # firebase.ts
│   └── public/          # PWA icons, manifest
├── ocr-server/
│   ├── main.py
│   └── ocr/             # processor.py, naver_shop.py
├── functions/           # Firebase Cloud Functions (FCM 알림 발송)
└── firestore.rules
```# kkomabaljaguk
