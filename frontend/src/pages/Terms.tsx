import { useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';

// ── Section helpers ───────────────────────────────────────────────────────────

function Article({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <h2 className="text-sm font-bold text-gray-900 mb-3 pb-1.5 border-b border-gray-100">
        제{number}조 ({title})
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-700 leading-relaxed mb-2">{children}</p>;
}

function Ul({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="text-sm text-gray-700 leading-relaxed space-y-1.5 list-disc list-inside pl-1">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mt-3">
      <p className="text-xs text-amber-800 leading-relaxed">{children}</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

/** 이용약관 */
export function Terms() {
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
          <h1 className="text-sm font-bold text-gray-900">이용약관</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">

        {/* 시행일 */}
        <div className="mb-6 text-xs text-gray-400">
          시행일: <strong className="text-gray-500">2026년 4월 1일</strong>
          &ensp;|&ensp;최종 수정일: 2026년 4월 1일
        </div>

        <Article number={1} title="목적">
          <P>
            이 약관은 꼬마발자국(이하 "서비스")이 제공하는 육아 인플루언서 공동구매(이하 "공구")
            일정 알림 서비스의 이용 조건 및 절차, 서비스 제공자와 이용자 간의 권리·의무 및
            책임 사항을 규정함을 목적으로 합니다.
          </P>
        </Article>

        <Article number={2} title="서비스 내용">
          <P>서비스는 다음의 기능을 제공합니다.</P>
          <Ul items={[
            '육아 인플루언서 공구 일정 정보 열람',
            '공구 시작 시간 기반 푸시 알림',
            '키워드 기반 신규 공구 알림',
            '이용자 공구 정보 제보 기능',
            '네이버 쇼핑 관련 상품 안내 (제휴 링크 포함)',
          ]} />
          <P>
            서비스에 표시되는 공구 정보는 인스타그램 oEmbed API를 통해
            원본 게시물을 연결하는 방식으로 제공됩니다.
            서비스는 인스타그램 콘텐츠를 직접 복제·저장하지 않습니다.
          </P>
        </Article>

        <Article number={3} title="이용자 의무">
          <Ul items={[
            '이용자는 본 약관 및 관련 법령을 준수하여야 합니다.',
            '이용자는 허위 정보를 제보하거나 타인의 명예를 훼손하는 행위를 하여서는 안 됩니다.',
            '이용자는 서비스의 정상적인 운영을 방해하는 행위를 하여서는 안 됩니다.',
            '이용자는 서비스를 통해 취득한 정보를 무단으로 복제·배포·상업적으로 이용하여서는 안 됩니다.',
          ]} />
          <Notice>
            <strong>연령 제한:</strong> 만 14세 미만 아동은 서비스를 이용할 수 없습니다.
            만 14세 미만 아동이 서비스를 이용하는 경우, 서비스 제공자는 해당 계정을 삭제할 수 있습니다.
          </Notice>
        </Article>

        <Article number={4} title="제보 콘텐츠 책임">
          <P>
            이용자가 제보하는 공구 정보(이하 "제보 콘텐츠")에 대한 책임은 다음과 같습니다.
          </P>
          <Ul items={[
            '제보 콘텐츠의 정확성과 저작권 책임은 제보자에게 있습니다.',
            '제보자는 제보 콘텐츠가 제3자의 저작권, 초상권, 기타 권리를 침해하지 않음을 보증합니다.',
            '타인의 콘텐츠를 무단으로 캡처하여 제보하는 행위는 금지됩니다.',
          ]} />
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-600 font-medium mb-1">검토 절차</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              이용자가 제보한 콘텐츠는 즉시 공개되지 않으며,
              관리자 검토(승인) 후에만 서비스에 공개됩니다.
              부적절한 콘텐츠는 승인 없이 거절될 수 있습니다.
            </p>
          </div>
        </Article>

        <Article number={5} title="면책 조항">
          <Ul items={[
            '서비스는 이용자가 제보한 공구 정보의 정확성·최신성·완전성을 보증하지 않습니다.',
            '서비스에 표시된 공구 가격, 일정, 상품 정보는 실제와 다를 수 있으며, 최종 확인 책임은 이용자에게 있습니다.',
            '서비스는 이용자 간 또는 이용자와 제3자(인플루언서, 판매자 등) 간의 분쟁에 개입하지 않습니다.',
            '서비스는 천재지변, 인터넷 장애 등 불가항력적 사유로 인한 서비스 중단에 대해 책임지지 않습니다.',
          ]} />
        </Article>

        <Article number={6} title="광고 및 제휴">
          <P>
            서비스 내에는 광고 및 제휴 링크가 포함될 수 있으며, 다음과 같이 표기됩니다.
          </P>
          <Ul items={[
            <>
              외부 쇼핑 링크는 <strong>[광고]</strong> 표기된 제휴 링크입니다.
              해당 링크를 통한 구매 시 서비스 운영자가 소정의 수수료를 받을 수 있습니다.
            </>,
            '제휴 링크는 현재 네이버 쇼핑 파트너스를 통해 제공됩니다.',
            'Google AdSense, 카카오 애드핏을 통한 광고가 표시될 수 있습니다.',
          ]} />
        </Article>

        <Article number={7} title="서비스 변경 및 중단">
          <Ul items={[
            '서비스는 운영상, 기술상의 필요에 따라 서비스의 전부 또는 일부를 변경할 수 있습니다.',
            '서비스 내용의 변경, 중단이 있을 경우 서비스 내 공지를 통해 이용자에게 알립니다.',
            '서비스는 무료로 제공되며, 서비스 종료 시 별도의 보상 의무가 없습니다.',
          ]} />
        </Article>

        <Article number={8} title="준거법 및 분쟁 해결">
          <P>
            이 약관은 대한민국 법률에 따라 해석되며, 서비스와 이용자 간에 발생한 분쟁에 대해서는
            민사소송법에 따른 관할 법원을 전속 관할로 합니다.
          </P>
        </Article>

        <Article number={9} title="약관 변경">
          <P>
            서비스는 「약관의 규제에 관한 법률」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등
            관련 법령을 위배하지 않는 범위 내에서 이 약관을 개정할 수 있습니다.
            약관이 변경되는 경우 시행 7일 전 서비스 내 공지를 통해 알립니다.
          </P>
          <P>시행일: 2026년 4월 1일</P>
        </Article>

      </main>

      <Footer />
    </div>
  );
}