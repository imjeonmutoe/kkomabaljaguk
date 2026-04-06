import { Link } from 'react-router-dom';

/**
 * Shared page footer — legal links + copyright.
 * Used on all user-facing pages (Timeline, DealDetail, Report, Privacy, Terms).
 */
export function Footer() {
  return (
    <footer className="max-w-lg mx-auto px-4 pt-6 pb-8">
      <div className="flex justify-center gap-4 text-xs text-gray-400 mb-2">
        <Link to="/terms" className="hover:text-gray-600 transition-colors">
          이용약관
        </Link>
        <span className="text-gray-200" aria-hidden>|</span>
        <Link to="/privacy" className="hover:text-gray-600 transition-colors">
          개인정보처리방침
        </Link>
        <span className="text-gray-200" aria-hidden>|</span>
        <Link to="/report" className="hover:text-gray-600 transition-colors">
          문의하기
        </Link>
      </div>
      <p className="text-center text-[11px] text-gray-300">
        © 2026 꼬마발자국. All rights reserved.
      </p>
    </footer>
  );
}