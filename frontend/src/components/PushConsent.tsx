import { useState } from 'react';
import { useFCM } from '../hooks/useFCM';
import { Modal } from './Modal';

const CONSENT_KEY = 'fcm_consent_shown';

function hasBeenShown(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) !== null;
  } catch {
    return true; // If localStorage is unavailable, don't show the popup
  }
}

function markShown(): void {
  try {
    localStorage.setItem(CONSENT_KEY, '1');
  } catch {
    // Ignore — popup simply may show again on next visit
  }
}

/**
 * 푸시 알림 동의 팝업.
 * 첫 방문 시에만 표시 (localStorage 'fcm_consent_shown' 키로 관리).
 * 이 컴포넌트는 자체적으로 표시 여부를 결정하므로 props 불필요.
 */
export function PushConsent() {
  const [visible, setVisible] = useState(() => !hasBeenShown());
  const [loading, setLoading] = useState(false);
  const { saveToken } = useFCM();

  if (!visible) return null;

  const dismiss = () => {
    markShown();
    setVisible(false);
  };

  const handleAllow = async () => {
    setLoading(true);
    await saveToken();
    setLoading(false);
    dismiss();
  };

  const handleLater = () => {
    dismiss();
  };

  return (
    <Modal aria-labelledby="push-consent-title">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
        {/* 아이콘 */}
        <div className="flex justify-center mb-3">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
            <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
        </div>

        {/* 타이틀 */}
        <h2
          id="push-consent-title"
          className="text-base font-bold text-gray-900 text-center mb-1"
        >
          공구 알림 받기
        </h2>

        {/* 설명 */}
        <p className="text-sm text-gray-500 text-center mb-6 leading-relaxed">
          관심 있는 공구가 시작되면<br />놓치지 않게 바로 알려드려요.
        </p>

        {/* 버튼 */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleAllow}
            disabled={loading}
            className="
              w-full bg-primary text-white font-semibold
              py-3 rounded-xl text-sm
              hover:bg-blue-800 active:bg-blue-900
              transition-colors duration-150
              disabled:opacity-60 disabled:cursor-not-allowed
              flex items-center justify-center gap-2
            "
          >
            {loading && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            알림 받기
          </button>

          <button
            onClick={handleLater}
            disabled={loading}
            className="
              w-full text-gray-400 font-medium
              py-2 text-sm
              hover:text-gray-600 active:text-gray-700
              transition-colors duration-150
              disabled:opacity-60
            "
          >
            나중에
          </button>
        </div>
      </div>
    </Modal>
  );
}