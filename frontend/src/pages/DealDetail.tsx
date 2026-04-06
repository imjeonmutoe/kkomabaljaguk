import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { OEmbed } from '../components/OEmbed';
import { NaverProducts } from '../components/NaverProducts';
import { AdSenseUnit } from '../components/AdSenseUnit';
import { AdfitUnit } from '../components/AdfitUnit';
import { Footer } from '../components/Footer';
import { getDealById, incrementViewCount } from '../hooks/useDeals';
import { auth, db } from '../lib/firebase';
import type { Deal } from '../types';
import type { Timestamp } from 'firebase/firestore';

const ADSENSE_SLOT_DETAIL = import.meta.env.VITE_ADSENSE_SLOT_DETAIL as string;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: Timestamp): string {
  const d = ts.toDate();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatPrice(price: number): string {
  return price > 0 ? `${price.toLocaleString('ko-KR')}원` : '가격 미정';
}

type DealPhase = 'ended' | 'active' | 'upcoming';

function getDealPhase(deal: Deal): DealPhase {
  const now = Date.now();
  if (deal.endAt.toDate().getTime() < now) return 'ended';
  if (deal.startAt.toDate().getTime() <= now) return 'active';
  return 'upcoming';
}

/** Deterministic alarm document ID — avoids a collection query + no extra index needed */
function alarmDocId(userId: string, dealId: string): string {
  return `${userId}_${dealId}`;
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="min-h-screen bg-gray-50 animate-pulse">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 max-w-lg mx-auto">
        <div className="w-8 h-8 rounded-full bg-gray-200" />
        <div className="h-4 w-40 bg-gray-200 rounded" />
      </div>
      <div className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-4">
        {/* Ad rect */}
        <div className="h-[250px] rounded-2xl bg-gray-200" />
        {/* Info card */}
        <div className="bg-white rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="h-5 w-16 bg-gray-200 rounded-full" />
            <div className="h-5 w-10 bg-gray-100 rounded-full" />
          </div>
          <div className="h-5 w-3/4 bg-gray-200 rounded" />
          <div className="h-4 w-1/3 bg-gray-100 rounded" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-16 bg-gray-100 rounded-xl" />
            <div className="h-16 bg-gray-100 rounded-xl" />
          </div>
        </div>
        {/* Embed */}
        <div className="bg-white rounded-2xl p-4">
          <div className="h-4 w-28 bg-gray-200 rounded mb-3" />
          <div className="aspect-square w-full bg-gray-100 rounded-xl" />
        </div>
        {/* Alarm button */}
        <div className="h-12 rounded-2xl bg-gray-200" />
      </div>
    </div>
  );
}

// ── 404 state ─────────────────────────────────────────────────────────────────

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center gap-4">
      <svg className="w-16 h-16 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-base font-bold text-gray-700">공구를 찾을 수 없어요</p>
      <p className="text-sm text-gray-400">존재하지 않거나 아직 승인 대기 중인 공구예요.</p>
      <button
        onClick={onBack}
        className="mt-2 text-sm text-primary font-semibold underline underline-offset-2"
      >
        목록으로 돌아가기
      </button>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ phase }: { phase: DealPhase }) {
  if (phase === 'ended') {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-400">
        종료됨
      </span>
    );
  }
  if (phase === 'active') {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1 w-fit">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
        진행중
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-primary">
      예정
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** 공구 상세 페이지 — /deal/:dealId */
export function DealDetail() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [loadingDeal, setLoadingDeal] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Alarm state
  const [hasAlarm, setHasAlarm] = useState(false);
  const [alarmBusy, setAlarmBusy] = useState(false);

  // Share toast
  const [shareCopied, setShareCopied] = useState(false);

  // Report state
  const [reportDone, setReportDone] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  // Current user ID (may be null briefly on first load)
  const [userId, setUserId] = useState<string | null>(auth.currentUser?.uid ?? null);

  // ── Auth listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid ?? null);
    });
    return unsub;
  }, []);

  // ── Fetch deal ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dealId) { setNotFound(true); setLoadingDeal(false); return; }

    getDealById(dealId).then((data) => {
      if (!data || data.status !== 'approved') {
        setNotFound(true);
      } else {
        setDeal(data);
        incrementViewCount(dealId); // fire-and-forget
      }
      setLoadingDeal(false);
    });
  }, [dealId]);

  // ── Check existing alarm ────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !dealId) return;
    getDoc(doc(db, 'alarms', alarmDocId(userId, dealId)))
      .then((snap) => setHasAlarm(snap.exists()))
      .catch(() => {});
  }, [userId, dealId]);

  // ── Alarm toggle ────────────────────────────────────────────────────────
  const handleAlarmToggle = useCallback(async () => {
    if (!userId || !dealId || alarmBusy) return;
    setAlarmBusy(true);
    const ref = doc(db, 'alarms', alarmDocId(userId, dealId));
    try {
      if (hasAlarm) {
        await deleteDoc(ref);
        setHasAlarm(false);
      } else {
        await setDoc(ref, {
          userId,
          dealId,
          createdAt: serverTimestamp(),
          notifiedAt: null,
        });
        setHasAlarm(true);
      }
    } catch (err) {
      console.error('[DealDetail] alarm toggle error:', err);
    } finally {
      setAlarmBusy(false);
    }
  }, [userId, dealId, hasAlarm, alarmBusy]);

  // ── Share ───────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const title = deal?.productName ?? '꼬마발자국 공구';
    const text = `${title} 공구 정보를 확인해 보세요!`;

    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; } catch { /* user cancelled */ }
    }
    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Last resort: prompt
      window.prompt('링크를 복사하세요', url);
    }
  }, [deal]);

  // ── Error report ────────────────────────────────────────────────────────
  const handleReport = useCallback(async () => {
    if (!userId || !dealId || reportBusy || reportDone) return;
    setReportBusy(true);
    try {
      await addDoc(collection(db, 'reports'), {
        dealId,
        reporterId: userId,
        reason: 'wrong_info',
        createdAt: serverTimestamp(),
      });
      setReportDone(true);
    } catch (err) {
      console.error('[DealDetail] report error:', err);
    } finally {
      setReportBusy(false);
    }
  }, [userId, dealId, reportBusy, reportDone]);

  // ── Render guards ───────────────────────────────────────────────────────
  if (loadingDeal) return <Skeleton />;
  if (notFound || !deal) return <NotFound onBack={() => navigate('/', { replace: true })} />;

  const phase = getDealPhase(deal);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          {/* 뒤로 가기 */}
          <button
            onClick={() => navigate(-1)}
            aria-label="뒤로 가기"
            className="flex-shrink-0 p-2 -ml-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Title */}
          <h1 className="flex-1 text-sm font-bold text-gray-900 truncate">{deal.productName}</h1>

          {/* 공유 버튼 */}
          <button
            onClick={handleShare}
            aria-label="공유하기"
            className="flex-shrink-0 relative p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            {/* 복사됨 toast */}
            {shareCopied && (
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap
                text-[10px] bg-gray-800 text-white px-2 py-1 rounded-lg pointer-events-none">
                링크 복사됨!
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-4">

        {/* ── AdSense — 상세 상단 (rectangle) ────────────────────────── */}
        <AdSenseUnit
          slot={ADSENSE_SLOT_DETAIL}
          format="rectangle"
          className="flex justify-center"
        />

        {/* ── Deal info card ─────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          {/* Status + category row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <StatusBadge phase={phase} />
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
              {deal.category}
            </span>
          </div>

          {/* Brand */}
          {deal.brand && (
            <p className="text-xs text-gray-400 mb-1">{deal.brand}</p>
          )}

          {/* Product name */}
          <h2 className="text-base font-bold text-gray-900 leading-snug mb-4">
            {deal.productName}
          </h2>

          {/* Price + date grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-1 font-medium uppercase tracking-wide">가격</p>
              <p className="font-bold text-primary text-sm">{formatPrice(deal.price)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-1 font-medium uppercase tracking-wide">기간</p>
              <p className="text-xs font-medium text-gray-700 leading-snug">
                {formatDate(deal.startAt)}<br />~ {formatDate(deal.endAt)}
              </p>
            </div>
          </div>
        </section>

        {/* ── Instagram oEmbed ───────────────────────────────────────── */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-3">인스타그램 게시물</h3>
          <OEmbed instagramUrl={deal.instagramUrl} cachedHtml={deal.oembedHtml || undefined} />
        </section>

        {/* ── 알림 받기 / 알림 취소 ─────────────────────────────────── */}
        <button
          onClick={handleAlarmToggle}
          disabled={alarmBusy || !userId || phase === 'ended'}
          aria-label={hasAlarm ? '알림 취소' : '알림 받기'}
          className={`
            w-full flex items-center justify-center gap-2
            py-3.5 rounded-2xl text-sm font-semibold
            transition-all duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
            ${hasAlarm
              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              : 'bg-primary text-white hover:bg-blue-800 shadow-sm'}
          `}
        >
          {alarmBusy ? (
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill={hasAlarm ? 'currentColor' : 'none'}
              viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          )}
          {phase === 'ended'
            ? '종료된 공구예요'
            : hasAlarm
            ? '알림 취소'
            : '알림 받기'}
        </button>

        {/* ── 네이버 쇼핑 상품 ───────────────────────────────────────── */}
        {deal.naverProducts.length > 0 && (
          <section className="bg-white rounded-2xl p-4 shadow-sm">
            <NaverProducts products={deal.naverProducts} dealId={dealId} />
          </section>
        )}

        {/* ── Adfit — 상세 하단 (AdSense와 영역 분리) ────────────────── */}
        <AdfitUnit className="flex justify-center" />

        {/* ── 오류 신고 ─────────────────────────────────────────────── */}
        <div className="flex justify-center pb-2">
          {reportDone ? (
            <p className="text-xs text-gray-400">신고가 접수됐어요. 검토 후 수정할게요.</p>
          ) : (
            <button
              onClick={handleReport}
              disabled={reportBusy || !userId}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {reportBusy ? '신고 중...' : '정보가 잘못됐나요? 신고하기'}
            </button>
          )}
        </div>

      </main>
      <Footer />
    </div>
  );
}