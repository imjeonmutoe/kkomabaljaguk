import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';

// ── Section helpers ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-sm font-bold text-gray-900 mb-3 pb-1.5 border-b border-gray-100">
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-gray-700 leading-relaxed mb-2${className ? ` ${className}` : ''}`}>{children}</p>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="text-sm text-gray-700 leading-relaxed space-y-1 list-disc list-inside pl-1">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden text-sm">
      {rows.map(([label, value], i) => (
        <div key={i} className={`flex ${i > 0 ? 'border-t border-gray-100' : ''}`}>
          <span className="w-36 flex-shrink-0 bg-gray-50 px-3 py-2.5 text-gray-500 font-medium text-xs">
            {label}
          </span>
          <span className="px-3 py-2.5 text-gray-700">{value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

/** 개인정보처리방침 */
export function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="뒤로"
            className="p-1.5 -ml-1 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-sm font-bold text-gray-900">개인정보처리방침</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">

        {/* 시행일 */}
        <div className="mb-6 text-xs text-gray-400">
          시행일: <strong className="text-gray-500">2026년 4월 1일</strong>
          &ensp;|&ensp;최종 수정일: 2026년 4월 1일
        </div>

        {/* Intro */}
        <Section title="개인정보처리방침">
          <P>
            꼬마발자국(이하 "서비스")은 「개인정보 보호법」 및 관련 법령에 따라
            이용자의 개인정보를 보호하고, 이와 관련한 고충을 신속하게 처리하기 위하여
            다음과 같이 개인정보처리방침을 수립·공개합니다.
          </P>
          <P>
            서비스는 <strong>이메일, 이름, 전화번호 등 식별 가능한 개인정보를 일체 수집하지 않습니다.</strong>
            알림 기능 이용 시 익명 기기 토큰만 수집합니다.
          </P>
        </Section>

        {/* 1. 수집 항목 */}
        <Section title="제1조 수집하는 개인정보 항목">
          <Table rows={[
            ['수집 항목', 'FCM(Firebase Cloud Messaging) 기기 토큰 (익명)'],
            ['수집 방법', '알림 수신 동의 시 기기에서 자동 발급'],
            ['비수집 항목', '이메일, 이름, 전화번호, 위치정보 등 일체'],
          ]} />
          <P className="mt-3">
            서비스는 Firebase Anonymous Authentication을 사용합니다.
            별도의 회원가입이나 로그인 없이 익명 식별자(UID)가 자동 부여되며,
            이는 개인을 식별하는 데 사용되지 않습니다.
          </P>
        </Section>

        {/* 2. 수집 목적 */}
        <Section title="제2조 개인정보 수집 및 이용 목적">
          <Ul items={[
            '공구 시작 알림 발송 — 이용자가 설정한 공구의 시작 시간 10분 전 FCM 푸시 알림 발송',
            '키워드 알림 발송 — 관심 키워드와 일치하는 신규 공구 등록 시 알림 발송',
            '서비스 품질 유지 — 만료된 토큰 자동 정리를 통한 시스템 최적화',
          ]} />
        </Section>

        {/* 3. 보유 기간 */}
        <Section title="제3조 개인정보 보유 및 이용 기간">
          <Table rows={[
            ['보유 기간', '마지막 서비스 접속일로부터 6개월'],
            ['자동 삭제', '6개월 경과 시 FCM 토큰 자동 삭제 (Firebase Cloud Functions 처리)'],
            ['즉시 삭제', '알림 설정 해제 시 FCM 토큰 즉시 삭제'],
          ]} />
          <P>
            위 기간 경과 후에는 해당 정보를 지체 없이 파기합니다.
            전자적 파일 형태의 경우 복구 불가능한 방법으로 영구 삭제합니다.
          </P>
        </Section>

        {/* 4. 제3자 제공 */}
        <Section title="제4조 개인정보의 제3자 제공">
          <P>
            서비스는 이용자의 개인정보를 <strong>제3자에게 제공하지 않습니다.</strong>
            다만, 아래의 경우는 예외로 합니다.
          </P>
          <Ul items={[
            '이용자가 사전에 동의한 경우',
            '법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우',
          ]} />
        </Section>

        {/* 5. 위탁 */}
        <Section title="제5조 개인정보 처리 위탁">
          <P>서비스는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를 위탁합니다.</P>
          <Table rows={[
            ['수탁자', 'Google LLC (Firebase)'],
            ['위탁 업무', '데이터베이스 저장 및 관리, FCM 푸시 알림 발송, 익명 인증'],
            ['보유·이용 기간', '위탁 계약 종료 시까지'],
            ['소재지', '미국'],
          ]} />
          <P>
            Firebase의 개인정보 처리방침은{' '}
            <a
              href="https://firebase.google.com/support/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              firebase.google.com/support/privacy
            </a>
            에서 확인하실 수 있습니다.
          </P>
        </Section>

        {/* 6. 정보주체 권리 */}
        <Section title="제6조 정보주체의 권리와 행사 방법">
          <P>이용자는 개인정보와 관련하여 다음과 같은 권리를 행사할 수 있습니다.</P>
          <Ul items={[
            '알림 해제 권리 — 앱 내 알림 설정에서 알림을 해제하면 FCM 토큰이 즉시 삭제됩니다.',
            '열람·삭제 요청 — 서비스 내 문의하기를 통해 요청할 수 있습니다.',
          ]} />
          <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-xs text-primary font-medium mb-1">알림 해제 방법</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              메인 화면 우측 상단 종 아이콘 → 알림을 설정한 경우, 해당 기기의 FCM 토큰이 즉시 Firestore에서 삭제됩니다.
            </p>
          </div>
        </Section>

        {/* 7. 안전성 확보 조치 */}
        <Section title="제7조 개인정보 안전성 확보 조치">
          <Ul items={[
            '데이터 암호화 — Firebase는 저장 데이터 및 전송 데이터를 암호화합니다.',
            '접근 제한 — Firestore 보안 규칙을 통해 본인 데이터에만 접근 가능하도록 제한합니다.',
            '관리자 접근 제한 — 관리자 계정은 Firebase 콘솔을 통해 별도 관리되며 최소 권한 원칙을 적용합니다.',
          ]} />
        </Section>

        {/* 8. 개인정보 보호책임자 */}
        <Section title="제8조 개인정보 보호책임자">
          <Table rows={[
            ['서비스명', '꼬마발자국'],
            ['문의 방법', '앱 내 문의하기 기능'],
          ]} />
          <P>
            개인정보 침해로 인한 신고나 상담은 아래 기관에 문의하실 수 있습니다.
          </P>
          <Ul items={[
            '개인정보침해신고센터: privacy.kisa.or.kr / 국번없이 118',
            '대검찰청 사이버수사과: spo.go.kr / 국번없이 1301',
            '경찰청 사이버안전국: cyberbureau.police.go.kr / 국번없이 182',
          ]} />
        </Section>

        {/* 9. 변경 안내 */}
        <Section title="제9조 개인정보처리방침 변경">
          <P>
            이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경 내용의 추가·삭제 및 정정이 있는 경우에는
            변경 사항의 시행 7일 전부터 서비스를 통해 공지합니다.
          </P>
          <P>시행일: 2026년 4월 1일</P>
        </Section>

      </main>

      <Footer />
    </div>
  );
}