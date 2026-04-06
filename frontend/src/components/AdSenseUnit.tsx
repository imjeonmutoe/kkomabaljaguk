import { useEffect, useRef, useState } from 'react';

type AdFormat = 'auto' | 'rectangle';

interface Props {
  /** AdSense 광고 슬롯 ID */
  slot: string;
  /** 광고 형식: 'auto' (반응형) | 'rectangle' (직사각형 고정) */
  format?: AdFormat;
  className?: string;
}

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;

type WindowWithAds = Window & { adsbygoogle?: unknown[] };

/**
 * Google AdSense 광고 단위.
 *
 * 동작:
 * - IntersectionObserver로 뷰포트 200px 이내에 진입할 때까지 광고 요청을 지연합니다.
 *   → 사용자가 보지 않는 광고는 로드하지 않아 Lighthouse 성능 점수를 개선합니다.
 * - 광고 미게재(unfilled) 감지: data-ad-status="unfilled" 확인 후 자동 숨김.
 * - StrictMode 이중 실행 방지: pushed ref 가드.
 * - 로드 실패 또는 슬롯 미설정 시 빈 공간 없이 자동 숨김.
 *
 * 사용처:
 *   타임라인: 3번째 카드마다 삽입
 *   상세 페이지: 상단에 배치
 */
export function AdSenseUnit({ slot, format = 'auto', className = '' }: Props) {
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!ADSENSE_CLIENT || !slot) {
      setVisible(false);
      return;
    }

    const ins = insRef.current;
    if (!ins) return;

    // Push the ad only once the <ins> element enters or approaches the viewport.
    // rootMargin: '200px' means the ad request fires 200px before it becomes visible.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (pushed.current) return;

        pushed.current = true;
        observer.disconnect();

        try {
          const win = window as WindowWithAds;
          win.adsbygoogle = win.adsbygoogle ?? [];
          win.adsbygoogle.push({});
        } catch {
          setVisible(false);
          return;
        }

        // Poll for unfilled: AdSense sets data-ad-status="unfilled" when no ad is available
        const timer = setTimeout(() => {
          if (ins.getAttribute('data-ad-status') === 'unfilled') {
            setVisible(false);
          }
        }, 2000);

        // Store timer ID on the element so we can clear it if the component unmounts
        // before the poll fires. We use a closure ref instead of another useRef so
        // this effect is self-contained.
        (ins as HTMLModElement & { _adTimer?: ReturnType<typeof setTimeout> })._adTimer = timer;
      },
      { rootMargin: '200px' }
    );

    observer.observe(ins);

    return () => {
      observer.disconnect();
      const t = (ins as HTMLModElement & { _adTimer?: ReturnType<typeof setTimeout> })._adTimer;
      if (t !== undefined) clearTimeout(t);
    };
  }, [slot]);

  if (!visible) return null;

  return (
    <div className={className}>
      <ins
        ref={insRef}
        className="adsbygoogle block"
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        {...(format === 'auto' ? { 'data-full-width-responsive': 'true' } : {})}
      />
    </div>
  );
}