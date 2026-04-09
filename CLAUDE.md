# 꼬마발자국 (KkomaBaljaguk) — CLAUDE.md

> Claude Code가 이 파일을 읽고 프로젝트 전체 컨텍스트를 즉시 파악합니다.
> 새 세션을 시작할 때마다 이 파일이 자동으로 로드됩니다.

---

## 프로젝트 한 줄 요약

**육아 인플루언서 공동구매(공구) 일정 알림 React PWA**
인플루언서가 인스타그램에서 진행하는 공구 정보를 자동 수집·제보받아 타임라인으로 보여주고, 공구 시작 알림(FCM)과 관심목록을 제공하는 서비스.

---

## 인프라 & 배포

| 구성요소 | 기술 | 비고 |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + PWA | Vercel 배포 |
| Backend | Firebase (Firestore, Auth, FCM) | 프로젝트 ID: `kkomabaljaguk-492507` |
| OCR 서버 | Python FastAPI + Google Cloud Vision API | Cloud Run (asia-northeast3) |
| 배포 URL | https://kkomabaljaguk.vercel.app | |
| OCR URL | https://kkomabaljaguk-ocr-317088571340.asia-northeast3.run.app | |
| GitHub | https://github.com/imjeonmutoe/kkomabaljaguk | |

---

## 디렉토리 구조

```
kkomabaljaguk/
├── frontend/
│   └── src/
│       ├── pages/        # Timeline, DealDetail, Report, Admin, Privacy, Terms
│       ├── components/   # DealCard, NaverProducts, OEmbed, AdSenseUnit, AdfitUnit
│       ├── hooks/        # useDeals, useFCM, useAnalytics
│       └── lib/          # firebase.ts
├── ocr-server/
│   ├── main.py
│   └── ocr/              # processor.py, naver_shop.py
├── functions/            # Firebase Cloud Functions
└── firestore.rules
```

---

## 코딩 규칙 (반드시 준수)

### 네이밍
- 컴포넌트: `PascalCase` (예: `DealCard`, `NaverProducts`)
- 훅: `camelCase` + `use` 접두사 (예: `useDeals`, `useFCM`)
- 상수: `UPPER_SNAKE_CASE` (예: `MAX_DEALS_PER_PAGE`)
- named export 사용 — **default export 절대 금지**

### 언어
- UI 문자열: **한국어**
- 코드 주석: **영어**

### 스타일링
- **Tailwind CSS만 사용** — 인라인 CSS(`style={}`) 절대 금지
- `styled-components`, `emotion` 등 CSS-in-JS 사용 금지

### 반응형
- **모바일 우선** — 기본이 모바일, `sm:` 이상에서 데스크탑 레이아웃

---

## 🎨 디자인 시스템 (변경 금지)

> 기존 색상·스타일을 유지하는 것이 최우선입니다. 새 컴포넌트를 만들 때도 반드시 아래 토큰을 사용하세요.

### 색상 팔레트

```
primary:        #F97316   (orange-500) — 메인 CTA, 강조 텍스트, 아이콘
primary-dark:   #EA580C   (orange-600) — hover 상태, 눌림 상태
primary-light:  #FED7AA   (orange-200) — 뱃지 배경, 연한 강조
background:     #FFF7ED   (orange-50)  — 전체 앱 배경색
surface:        #FFFFFF              — 카드, 모달 배경
text-primary:   #1C1917   (stone-900)  — 본문 텍스트
text-secondary: #78716C   (stone-500)  — 서브 텍스트, 메타정보
border:         #E7E5E4   (stone-200)  — 구분선, 카드 테두리
danger:         #EF4444   (red-500)    — 마감임박 뱃지, 삭제
success:        #22C55E   (green-500)  — 승인 상태
```

### Tailwind 클래스 패턴

```
앱 배경:        bg-orange-50
카드:           bg-white rounded-2xl shadow-sm border border-stone-200
primary 버튼:   bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-4 py-2 font-semibold
아웃라인 버튼:  border border-orange-500 text-orange-500 hover:bg-orange-50 rounded-xl px-4 py-2
뱃지(HOT):      bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full
뱃지(마감임박): bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full
섹션 타이틀:    text-stone-900 font-bold text-lg
서브 텍스트:    text-stone-500 text-sm
네비게이션:     bg-white border-t border-stone-200 (하단 고정)
```

### 폰트 & 타이포그래피

```
기본 폰트:    시스템 폰트 스택 (Tailwind 기본)
제목 크기:    text-xl font-bold (페이지 타이틀)
본문 크기:    text-sm ~ text-base
가격 강조:    text-orange-500 font-bold text-lg
할인율:       text-red-500 font-semibold
```

---

## Firestore 컬렉션 구조

```
deals/{dealId}
  productName: string
  brand: string
  category: string        // 전체|식품|영양제|도서|교구|육아 서포트템|기타
  startAt: Timestamp
  endAt: Timestamp
  price: number           // 공구가
  originalPrice: number   // 정가
  instagramUrl: string
  sourceUrl: string       // 인포크 or srookpay 링크 (원본 출처)
  thumbnailUrl: string    // og:image URL (저장만, 복사 없음)
  oembedHtml: string
  naverProducts: []
  status: 'pending'|'approved'|'rejected'
  reporterId: string      // uid or 'system'
  reporterRole: 'user'|'influencer'|'system'
  createdAt: Timestamp
  viewCount: number

influencers/{id}
  inpockUrl: string       // link.inpock.co.kr/계정명
  name: string
  instagramId: string
  lastScrapedAt: Timestamp
  active: boolean

users/{userId}
  fcmToken: string
  keywords: string[]
  notificationConsent: boolean
  lastActiveAt: Timestamp

alarms/{alarmId}
  userId: string
  dealId: string
  createdAt: Timestamp
  notifiedAt: Timestamp

admins/{uid}
  isAdmin: true
```

---

## 데이터 수집 경로 (3가지)

### ① 인포크 자동 수집 (메인, 하루 1회)
```
influencers 컬렉션 (active: true) 순회
→ link.inpock.co.kr/{username} fetch
→ __NEXT_DATA__.props.pageProps.blocks 파싱
→ 공구OPEN 섹션 이후 블록 추출
→ 각 block.url (srookpay) → og:title, og:image, 가격 추출
→ 중복 체크 (sourceUrl + productName)
→ 신규만 deals/{id} pending 저장
→ FCM 알림 발송
```

### ② 유저/인플루언서 직접 공유
```
인포크 링크 입력 → 공구OPEN 항목 파싱 → 체크박스 선택 → pending
스토어 링크 입력 → 상품명/가격/썸네일 자동 추출 → pending
```

### ③ OCR 이미지 업로드 (보조)
```
스크린샷 → Google Cloud Vision API → 텍스트 추출 → 폼 자동 채움
```

### 파싱 결과 예시

**인포크 blocks:**
```json
[
  { "title": "🏷️ 공 구 O P E N", "block_type": "label" },
  {
    "title": "레꼴뜨 무선 만능 초퍼",
    "image": "//img.srookpay.com/...",
    "url": "https://srok.kr/ghCMX",
    "open_at": "2026-04-10T00:00:00",
    "open_until": "2026-04-15T23:59:59",
    "block_type": "link"
  }
]
```

**srookpay 파싱 결과:**
```json
{
  "ogTitle": "[강미즈] 레꼴뜨 무선 본느 만능 초퍼",
  "ogImage": "//img.srookpay.com/data/goods/dyp_store01/small/thum/...",
  "price": "79,000원",
  "originalPrice": "129,000원"
}
```

---

## 화면 구성 (3탭)

### 하단 네비게이션 (fixed bottom)
```
타임라인          공유            내 정보
🏠 집 아이콘    ➕ 플러스 아이콘   👤 사람 아이콘
```
- 위치: `fixed bottom-0` 하단 고정
- 배경: `bg-white border-t border-stone-200`
- 활성 탭: `text-orange-500`
- 비활성 탭: `text-stone-400`
- 아이콘 + 텍스트 라벨 세트로 구성
- 홈(Home) 별도 버튼 없음 — 타임라인이 홈 역할
- 알림 탭 없음 — 내 정보 탭 안으로 흡수

### 타임라인
- 카테고리 필터 탭: 전체 / 식품 / 영양제 / 도서 / 교구 / 육아 서포트템 / 기타
- 딜 카드: 썸네일 + 인플루언서 계정 + 상품명 + 가격(정가/공구가/할인율)
- ♥ 관심목록 / 🔔 알림 버튼 (카드 내)
- HOT 뱃지 (viewCount 기준) / 마감임박 뱃지
- AdSense 광고 (3번째 카드마다)

### 공유 (Report.tsx)
- **단일 링크 입력창** (탭 없음) — 링크 유형 자동 감지
  - `link.inpock.co.kr/...` → 공구OPEN 항목 체크박스 목록
  - `shop.srookpay.com/...` → 단일 상품 자동 추출
  - 이미지 업로드 → OCR
- "전체 선택" 버튼: 인플루언서/관리자만 노출
- 공통 필드: 카테고리(필수), 시작일, 종료일

### 내 정보
- 프로필 (익명 상태 표시 + 카카오 로그인 유도, 강제 아님)
- 관심목록 그리드
- 알림 내역
- 알림 설정 토글 (신규 공구 / 마감임박 / 관심 카테고리)

---

## 로그인 전략

```
기본: Firebase 익명 Auth
  ↓ 관심목록/알림 시도 시
소프트 넛지: "카카오로 계속하면 기기를 바꿔도 유지돼요"
  ↓
카카오 or 구글 소셜 로그인 (강제 아님)
  ↓
linkWithCredential()으로 기존 데이터 이전

관리자: 구글 로그인 필수 (/admin 경로)
        admins/{uid}.isAdmin === true 검증
```

---

## 법적 제약 (위반 시 서비스 운영 불가)

1. **Instagram 콘텐츠** → oEmbed API만 허용, 직접 복제 절대 금지
2. **네이버 파트너스 링크** → `[광고]` 배지 필수 노출
3. **유저 제보** → `status: pending` → 관리자 승인 후에만 `approved` 공개
4. **이미지** → URL 참조만 허용, 서버에 복사 저장 금지
5. **크롤링** → 하루 1회 단건 fetch (대량 자동화 금지)

---

## 수익화

| 채널 | 위치 |
|---|---|
| Google AdSense | 타임라인 3번째 카드마다, 상세 상단 |
| 카카오 애드핏 | 상세 페이지 하단 |
| 네이버 쇼핑 파트너스 | naverProducts 링크 (`[광고]` 배지 필수) |

---

## 남은 작업 목록 (우선순위 순)

- [ ] **1. 인포크 자동 수집** — Cloud Functions 스케줄러, `__NEXT_DATA__` 파싱, srookpay 추출, influencers 컬렉션 + Firestore Rules
- [ ] **2. 공유 화면 개선** — Report.tsx 단일 입력창, 링크 유형 자동 감지, 체크박스 UI
- [ ] **3. DealCard 썸네일** — `thumbnailUrl` 우선 → `naverProducts[0].image` → placeholder
- [ ] **4. 내 정보 탭** — 관심목록, 알림 내역, 알림 설정, 소셜 로그인 유도 UI
- [ ] **5. 관리자 UID 등록** — 구글 로그인 후 UID → `admins/{uid}` isAdmin: true
- [ ] **6. OCR 서버 교체** — EasyOCR/torch 제거 → `google-cloud-vision` 적용
- [ ] **7. 네이버 API 키 주입** — Cloud Run 재배포 시 `--update-env-vars` 적용
- [ ] **8. 하단 네비게이션 개선** — 3탭(타임라인/공유/내정보), 알림 탭 제거, 제보→공유 텍스트 변경, 활성탭 orange-500

---

## 환경변수

### Frontend (Vercel)
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=kkomabaljaguk-492507
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_VAPID_KEY
VITE_OCR_SERVER_URL=https://kkomabaljaguk-ocr-317088571340.asia-northeast3.run.app
```

### OCR 서버 (Cloud Run)
```
FIREBASE_CREDENTIALS=  # base64 인코딩된 서비스 계정 JSON
FIREBASE_PROJECT_ID=kkomabaljaguk-492507
NAVER_CLIENT_ID=       # 발급 완료
NAVER_CLIENT_SECRET=   # 발급 완료
```

### Cloud Run 재배포 명령어
```bash
cd ocr-server
gcloud run deploy kkomabaljaguk-ocr \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --project kkomabaljaguk-492507 \
  --update-env-vars NAVER_CLIENT_ID=발급ID,NAVER_CLIENT_SECRET=발급SECRET
```

---

*최종 업데이트: 2026-04-09*