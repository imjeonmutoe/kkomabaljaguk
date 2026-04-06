# 꼬마발자국 (KkomaBaljaguk)

육아 인플루언서 공구 일정 알림 React PWA — v2.0

## 아키텍처
- Frontend: React 18 + Vite + PWA → Vercel
- Backend: Firebase (Firestore, Auth, FCM, Storage)
- OCR Server: Python FastAPI + EasyOCR → Railway
- Monetization: AdSense + 카카오 애드핏 + 네이버 쇼핑 파트너스
  ※ 쿠팡 파트너스 없음 (약관 문제로 v2.0에서 제거됨)

## 디렉토리 구조
```
kkomabaljaguk/
├── CLAUDE.md
├── frontend/
│   ├── CLAUDE.md
│   ├── src/
│   │   ├── pages/       # Timeline, DealDetail, Report, Admin, Privacy, Terms
│   │   ├── components/  # DealCard, NaverProducts, OEmbed, AdSenseUnit, AdfitUnit, PushConsent
│   │   ├── hooks/       # useDeals, useFCM, useAnalytics
│   │   └── lib/         # firebase.js, oembed.js
│   └── public/          # sw.js, manifest.json
├── ocr-server/
│   ├── CLAUDE.md
│   ├── main.py
│   └── ocr/             # processor.py, naver_shop.py
└── functions/           # Firebase Cloud Functions
    └── index.js
```

## Firestore 컬렉션 구조
```
deals:     { productName, brand, category, startAt, endAt, price,
             instagramUrl, oembedHtml, naverProducts[], naverUpdatedAt,
             status(pending/approved/rejected), reporterId, createdAt, viewCount }
users:     { fcmToken, keywords[], notificationConsent, lastActiveAt }
alarms:    { userId, dealId, createdAt, notifiedAt }
```

## 핵심 비즈니스 규칙 (위반 시 법적 문제)
1. Instagram 콘텐츠는 반드시 oEmbed API만 사용 — 직접 복제 절대 금지
2. 네이버 파트너스 링크가 포함된 모든 섹션에 [광고] 배지 필수
3. 사용자 제보 → status='pending' → 관리자 승인 후에만 공개
4. Firebase Anonymous Auth만 사용 — 이메일·이름 수집 금지

## 중요 결정사항
- 2026-04: 쿠팡 파트너스 제거 → 네이버 쇼핑 파트너스로 교체 (자동화 허용)
- 2026-04: AdMob 제거 → AdSense로 교체 (PWA 미지원)
- 2026-04: onSnapshot 대신 getDocs + 5분 폴링 채택 (Firestore 비용 절감)

## 환경변수 목록
@frontend/.env.example 참조
@ocr-server/.env.example 참조
