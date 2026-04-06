import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Kakao Adfit 광고 단위 ID (기본값: VITE_ADFIT_UNIT_ID 환경변수) */
  unit?: string;
  className?: string;
}

const DEFAULT_UNIT = import.meta.env.VITE_ADFIT_UNIT_ID as string | undefined;

/**
 * 카카오 애드핏 광고 단위 (320×50 모바일 배너).
 * 상세 페이지 하단에만 사용 (AdSense와 영역 분리).
 *
 * 동작:
 * - IntersectionObserver로 뷰포트 200px 이내에 진입할 때까지 스크립트 삽입을 지연합니다.
 *   → 사용자가 스크롤하지 않으면 Adfit 스크립트를 로드하지 않습니다.
 * - 스크립트는 컴포넌트 마운트당 한 번만 주입됩니다 (injected ref 가드).
 * - 언마운트 시 DOM 정리 → 재마운트 시 중복 광고 방지.
 * - 단위 ID 미설정 또는 스크립트 로드 실패 시 자동 숨김.
 */
export function AdfitUnit({ unit = DEFAULT_UNIT, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const injected = useRef(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!unit) {
      setVisible(false);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Delay script injection until the container approaches the viewport
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (injected.current) return;

        injected.current = true;
        observer.disconnect();

        // <ins> element Kakao Adfit requires
        const ins = document.createElement('ins');
        ins.className = 'kakao_ad_area';
        ins.setAttribute('style', 'display:none;');
        ins.setAttribute('data-ad-unit', unit);
        ins.setAttribute('data-ad-width', '320');
        ins.setAttribute('data-ad-height', '50');
        container.appendChild(ins);

        // Kakao Adfit SDK — load once per intersection
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = '//t1.daumcdn.net/kas/static/ba.min.js';
        script.async = true;
        script.onerror = () => setVisible(false);
        container.appendChild(script);
      },
      { rootMargin: '200px' }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
      // Clean up injected elements on unmount to prevent duplicate ads on remount
      container.innerHTML = '';
      injected.current = false;
    };
  }, [unit]);

  if (!visible) return null;

  return <div ref={containerRef} className={className} />;
}