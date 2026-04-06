import { useAnalytics } from '../hooks/useAnalytics';
import type { NaverProduct } from '../types';

interface Props {
  /** Firestore에 저장된 네이버 쇼핑 상품 목록 */
  products: NaverProduct[] | null | undefined;
  /**
   * 클릭 이벤트를 Firestore에 기록할 때 사용하는 딜 ID.
   * 제공하지 않으면 클릭 추적을 건너뜁니다.
   */
  dealId?: string;
}

const HTML_TAG_RE = /<[^>]+>/g;

function stripHtml(text: string): string {
  return text.replace(HTML_TAG_RE, '');
}

function formatPrice(lprice: string): string {
  const n = parseInt(lprice, 10);
  if (isNaN(n) || n === 0) return '가격 미정';
  return n.toLocaleString('ko-KR') + '원';
}

/**
 * 네이버 파트너스 상품 가로 스크롤 카드 목록.
 * [광고] 배지 필수 표시 — 네이버 파트너스 링크 포함 시 광고 표시 의무 (법적 요건).
 * 최대 3개 카드 표시. products가 비어 있으면 null 반환.
 * 카드 클릭 시 dealId와 카드 인덱스를 Firestore analytics 컬렉션에 기록.
 */
export function NaverProducts({ products, dealId }: Props) {
  const { trackNaverClick } = useAnalytics();

  if (!products || products.length === 0) return null;

  const displayed = products.slice(0, 3);

  return (
    <section aria-label="네이버 쇼핑 관련 상품">
      {/* 섹션 헤더 + [광고] 배지 */}
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-bold text-gray-700">네이버 쇼핑 관련 상품</h3>
        {/* [광고] 배지 — 네이버 파트너스 링크 의무 표시 */}
        <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded leading-none">
          광고
        </span>
      </div>

      {/*
        가로 스크롤 컨테이너
        - overflow-x-auto + snap-x for iOS momentum scrolling
        - scrollbarWidth: none for clean mobile look
        - touch-pan-x allows native touch scroll without interfering with vertical scroll
      */}
      <div
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {displayed.map((product, idx) => (
          <a
            key={idx}
            href={product.link}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => {
              if (dealId) trackNaverClick(dealId, idx);
            }}
            className="
              flex-shrink-0 w-36 snap-start
              flex flex-col
              bg-white border border-gray-100 rounded-xl overflow-hidden
              hover:shadow-md active:scale-[0.98]
              transition-all duration-150
            "
          >
            {/* 상품 이미지 */}
            <div className="w-full aspect-square bg-gray-100 overflow-hidden">
              {product.image ? (
                <img
                  src={product.image}
                  alt={stripHtml(product.title)}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* 상품 정보 */}
            <div className="p-2 flex flex-col gap-1 flex-1">
              <p className="text-[11px] text-gray-800 font-medium line-clamp-2 leading-snug">
                {stripHtml(product.title)}
              </p>
              <div className="mt-auto">
                <p className="text-xs font-bold text-primary">{formatPrice(product.lprice)}</p>
                <p className="text-[10px] text-gray-400 truncate">{product.mallName}</p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}