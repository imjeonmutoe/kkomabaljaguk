import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import {
  signInWithPopup, linkWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { Bell, BellOff, Heart, User, ChevronRight, X } from 'lucide-react';
import { db, auth, googleProvider } from '../lib/firebase';
import { BottomNav } from '../components/BottomNav';
import { Modal } from '../components/Modal';
import { getCategoryDef } from '../lib/categories';
import type { Deal, Alarm } from '../types/index';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotifSettings {
  newDeal: boolean;
  closing: boolean;
  category: boolean;
}

interface WishlistDoc {
  dealId: string;
  addedAt: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMs(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === 'string') return new Date(v).getTime();
  if (typeof (v as { toMillis?: unknown }).toMillis === 'function')
    return (v as { toMillis: () => number }).toMillis();
  return null;
}

function formatDateLabel(v: unknown): string {
  const ms = toMs(v);
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

// ── Login modal ───────────────────────────────────────────────────────────────

function LoginModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogle() {
    setLoading(true);
    setError('');
    try {
      const user = auth.currentUser;
      if (user?.isAnonymous) {
        // Link anonymous account to Google
        await linkWithPopup(user, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
      onClose();
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'auth/credential-already-in-use') {
        // Already linked elsewhere — sign in directly
        await signInWithPopup(auth, new GoogleAuthProvider());
        onClose();
      } else {
        setError('로그인 중 오류가 발생했어요. 다시 시도해 주세요.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} aria-labelledby="login-modal-title">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-stone-900">로그인</h2>
            <p className="text-sm text-stone-500 mt-1 leading-relaxed">
              로그인하면 기기를 바꿔도<br />관심목록·알림이 유지돼요
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-stone-100 transition-colors -mr-1 -mt-1"
            aria-label="닫기"
          >
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        {/* Google login */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 border border-stone-200 rounded-xl py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 active:scale-[0.98] transition-all disabled:opacity-50 mb-3"
        >
          {/* Google G icon */}
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? '로그인 중...' : '구글로 계속하기'}
        </button>

        {/* Kakao login — placeholder (not yet implemented) */}
        <button
          disabled
          className="w-full flex items-center justify-center gap-3 bg-[#FEE500] rounded-xl py-3 text-sm font-semibold text-[#191919] opacity-50 cursor-not-allowed mb-3"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#191919">
            <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.726 1.617 5.12 4.05 6.538L5.1 21l4.37-2.88C10.27 18.37 11.12 18.5 12 18.5c5.523 0 10-3.477 10-7.7S17.523 3 12 3z"/>
          </svg>
          카카오로 계속하기 (준비 중)
        </button>

        {error && <p className="text-xs text-red-500 text-center">{error}</p>}

        <p className="text-[11px] text-stone-400 text-center mt-2">
          강제가 아니에요. 언제든지 익명으로 이용할 수 있어요.
        </p>
      </div>
    </Modal>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({ onConfirm, onCancel, deleting }: {
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <Modal onClose={onCancel}>
      <div className="bg-white rounded-2xl shadow-lg border border-stone-200 w-full max-w-sm p-6">
        <h2 className="text-base font-bold text-stone-900 mb-2">제보 삭제</h2>
        <p className="text-sm text-stone-500 mb-6 leading-relaxed">
          정말 삭제하시겠어요? 되돌릴 수 없어요.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-stone-300 text-stone-600 hover:bg-stone-50 disabled:opacity-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 transition-colors"
          >
            {deleting ? '삭제 중…' : '삭제'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Mini deal card (2-col grid) ───────────────────────────────────────────────

function WishCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const thumb =
    deal.thumbnailUrl ||
    deal.naverProducts?.[0]?.image ||
    '/placeholder-product.svg';
  const { color } = getCategoryDef(deal.category);

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden text-left active:scale-[0.98] transition-all w-full"
    >
      <div className="aspect-square w-full bg-stone-100 overflow-hidden">
        <img
          src={thumb}
          alt={deal.productName}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder-product.svg'; }}
        />
      </div>
      <div className="p-2.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${color}`}>
          {deal.category}
        </span>
        <p className="text-xs font-semibold text-stone-900 mt-1.5 line-clamp-2 leading-snug">
          {deal.productName}
        </p>
        {deal.price > 0 && (
          <p className="text-xs font-bold text-orange-500 mt-1">
            {deal.price.toLocaleString('ko-KR')}원
          </p>
        )}
      </div>
    </button>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  sub,
  enabled,
  onToggle,
}: {
  label: string;
  sub?: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-stone-900">{label}</p>
        {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          enabled ? 'bg-orange-500' : 'bg-stone-200'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold text-stone-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MyPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(auth.currentUser);
  const [showLogin, setShowLogin] = useState(false);

  // Wishlist deals (fetched from deals collection)
  const [wishDeals, setWishDeals] = useState<Deal[]>([]);
  const [wishLoading, setWishLoading] = useState(true);

  // Alarm history
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [alarmDeals, setAlarmDeals] = useState<Record<string, string>>({}); // dealId → productName

  // My reported deals
  const [myDeals, setMyDeals] = useState<Deal[]>([]);
  const [myDealsLoading, setMyDealsLoading] = useState(true);
  const [deletingDeal, setDeletingDeal] = useState<Deal | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  // Notification settings
  const [notif, setNotif] = useState<NotifSettings>({
    newDeal: true,
    closing: true,
    category: false,
  });
  const [notifSaving, setNotifSaving] = useState(false);

  // Sync auth state
  useEffect(() => {
    return auth.onAuthStateChanged((u) => setUser(u));
  }, []);

  const uid = user?.uid ?? null;
  const isAnon = user?.isAnonymous ?? true;

  // ── Wishlist subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) { setWishLoading(false); return; }

    const ref = collection(db, 'users', uid, 'wishlist');
    const unsub = onSnapshot(ref, async (snap) => {
      const docs = snap.docs.map((d) => d.data() as WishlistDoc);
      if (docs.length === 0) { setWishDeals([]); setWishLoading(false); return; }

      // Batch-fetch deals
      const { getDoc, doc: docRef } = await import('firebase/firestore');
      const snaps = await Promise.all(
        docs.map((d) => getDoc(docRef(db, 'deals', d.dealId))),
      );
      const deals = snaps
        .filter((s) => s.exists())
        .map((s) => ({ id: s.id, ...s.data() }) as Deal);
      setWishDeals(deals);
      setWishLoading(false);
    });

    return unsub;
  }, [uid]);

  // ── Alarm history ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uid || isAnon) return;

    const q = query(
      collection(db, 'alarms'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(20),
    );
    const unsub = onSnapshot(q, (snap) => {
      setAlarms(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Alarm));
    });
    return unsub;
  }, [uid, isAnon]);

  // Fetch productNames for alarms
  useEffect(() => {
    if (alarms.length === 0) return;
    const ids = [...new Set(alarms.map((a) => a.dealId))];
    Promise.all(
      ids.map(async (id) => {
        const { getDoc, doc: docRef } = await import('firebase/firestore');
        const snap = await getDoc(docRef(db, 'deals', id));
        return snap.exists()
          ? { id, name: (snap.data() as Deal).productName }
          : null;
      }),
    ).then((results) => {
      const map: Record<string, string> = {};
      results.forEach((r) => { if (r) map[r.id] = r.name; });
      setAlarmDeals(map);
    });
  }, [alarms]);

  // ── My reported deals subscription ───────────────────────────────────────
  useEffect(() => {
    if (!uid) { setMyDealsLoading(false); return; }

    const q = query(
      collection(db, 'deals'),
      where('reporterId', '==', uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Deal)
        .sort((a, b) => {
          const aMs = typeof (a.createdAt as { toMillis?: () => number }).toMillis === 'function'
            ? (a.createdAt as { toMillis: () => number }).toMillis()
            : 0;
          const bMs = typeof (b.createdAt as { toMillis?: () => number }).toMillis === 'function'
            ? (b.createdAt as { toMillis: () => number }).toMillis()
            : 0;
          return bMs - aMs;
        });
      setMyDeals(docs);
      setMyDealsLoading(false);
    });
    return unsub;
  }, [uid]);

  const handleDeleteMyDeal = useCallback(async () => {
    if (!deletingDeal) return;
    setDeleteInProgress(true);
    try {
      await deleteDoc(doc(db, 'deals', deletingDeal.id));
      setDeletingDeal(null);
    } catch (err) {
      console.error('[MyPage] deleteDoc error:', err);
      alert('삭제에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setDeleteInProgress(false);
    }
  }, [deletingDeal]);

  // ── Notification settings subscription ───────────────────────────────────
  useEffect(() => {
    if (!uid || isAnon) return;

    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setNotif({
        newDeal: data.notifyNewDeal ?? true,
        closing: data.notifyClosing ?? true,
        category: data.notifyCategory ?? false,
      });
    });
    return unsub;
  }, [uid, isAnon]);

  // ── Save notification settings ────────────────────────────────────────────
  const saveNotif = useCallback(
    async (next: NotifSettings) => {
      if (!uid || isAnon) return;
      setNotifSaving(true);
      try {
        await setDoc(
          doc(db, 'users', uid),
          {
            notifyNewDeal: next.newDeal,
            notifyClosing: next.closing,
            notifyCategory: next.category,
            notificationConsent: next.newDeal || next.closing || next.category,
            lastActiveAt: serverTimestamp(),
          },
          { merge: true },
        );
      } finally {
        setNotifSaving(false);
      }
    },
    [uid, isAnon],
  );

  function toggleNotif(key: keyof NotifSettings) {
    if (isAnon) { setShowLogin(true); return; }
    const next = { ...notif, [key]: !notif[key] };
    setNotif(next);
    saveNotif(next);
  }

  function handleWishlistClick() {
    if (isAnon) setShowLogin(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-orange-50 pb-24">

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

      {deletingDeal && (
        <DeleteConfirmModal
          onConfirm={handleDeleteMyDeal}
          onCancel={() => setDeletingDeal(null)}
          deleting={deleteInProgress}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <h1 className="text-sm font-bold text-stone-900">내 정보</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 flex flex-col gap-4">

        {/* ── 1. Profile ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <User className="w-7 h-7 text-orange-400" />
            </div>
            <div>
              {isAnon ? (
                <>
                  <p className="text-sm font-semibold text-stone-900">익명 사용자</p>
                  <p className="text-xs text-stone-400 mt-0.5">로그인하지 않은 상태예요</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-stone-900">
                    {user?.displayName ?? '사용자'}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">{user?.email ?? ''}</p>
                </>
              )}
            </div>
          </div>

          {isAnon ? (
            <>
              <div className="bg-orange-50 rounded-xl p-3 mb-3">
                <p className="text-xs text-stone-600 leading-relaxed">
                  로그인하면 기기를 바꿔도<br />
                  <span className="font-semibold text-orange-500">관심목록·알림이 유지</span>돼요
                </p>
              </div>
              <button
                onClick={() => setShowLogin(true)}
                className="w-full flex items-center justify-between bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl px-4 py-3 text-sm active:scale-[0.98] transition-all"
              >
                <span>소셜 계정으로 시작하기</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => auth.signOut()}
              className="w-full border border-stone-200 text-stone-500 hover:bg-stone-50 rounded-xl py-2.5 text-sm font-medium transition-colors"
            >
              로그아웃
            </button>
          )}
        </div>

        {/* ── 2. Wishlist ──────────────────────────────────────────────────── */}
        <Section title="관심목록">
          <div className="px-4 pb-4">
            {isAnon ? (
              <button
                onClick={handleWishlistClick}
                className="w-full flex flex-col items-center justify-center py-8 gap-2 text-stone-400 hover:text-orange-400 transition-colors"
              >
                <Heart className="w-8 h-8" />
                <p className="text-sm">로그인하면 관심목록을 볼 수 있어요</p>
              </button>
            ) : wishLoading ? (
              <div className="py-8 flex justify-center">
                <span className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : wishDeals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-stone-400">
                <Heart className="w-8 h-8" />
                <p className="text-sm">관심 공구를 하트로 저장해보세요</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {wishDeals.map((deal) => (
                  <WishCard
                    key={deal.id}
                    deal={deal}
                    onClick={() => navigate(`/deal/${deal.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* ── 3. My reported deals ─────────────────────────────────────────── */}
        <Section title="내 제보 목록">
          <div className="px-4 pb-4">
            {isAnon ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-stone-400">
                <p className="text-sm">로그인 후 내 제보를 확인할 수 있어요</p>
              </div>
            ) : myDealsLoading ? (
              <div className="py-8 flex justify-center">
                <span className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : myDeals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-stone-400">
                <p className="text-sm">제보한 공구가 없어요</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {myDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="flex items-center justify-between gap-3 py-3 border-b border-stone-100 last:border-0"
                  >
                    <button
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      onClick={() => navigate(`/deal/${deal.id}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900 truncate">{deal.productName}</p>
                        <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${
                          deal.status === 'approved'
                            ? 'bg-green-100 text-green-600'
                            : deal.status === 'rejected'
                              ? 'bg-red-100 text-red-500'
                              : 'bg-amber-100 text-amber-600'
                        }`}>
                          {deal.status === 'approved' ? '승인됨' : deal.status === 'rejected' ? '거절됨' : '검토 중'}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={() => setDeletingDeal(deal)}
                      className="flex-shrink-0 text-xs bg-red-500 hover:bg-red-600 text-white font-semibold px-3 py-1.5 rounded-xl transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* ── 4. Alarm history ─────────────────────────────────────────────── */}
        <Section title="알림 내역">
          {isAnon ? (
            <div className="px-4 pb-4 flex flex-col items-center justify-center py-8 gap-2 text-stone-400">
              <BellOff className="w-8 h-8" />
              <p className="text-sm">로그인 후 알림 내역을 확인해보세요</p>
            </div>
          ) : alarms.length === 0 ? (
            <div className="px-4 pb-4 flex flex-col items-center justify-center py-8 gap-2 text-stone-400">
              <BellOff className="w-8 h-8" />
              <p className="text-sm">받은 알림이 없어요</p>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {alarms.map((alarm) => (
                <li
                  key={alarm.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-stone-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/deal/${alarm.dealId}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Bell className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">
                        {alarmDeals[alarm.dealId] ?? '공구 알림'}
                      </p>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        {formatDateLabel(alarm.createdAt)}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300 flex-shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ── 4. Notification settings ─────────────────────────────────────── */}
        <Section title="알림 설정">
          <div className="px-4 pb-2 divide-y divide-stone-100">
            <ToggleRow
              label="신규 공구 알림"
              sub="새로운 공구가 올라오면 알려드려요"
              enabled={notif.newDeal}
              onToggle={() => toggleNotif('newDeal')}
            />
            <ToggleRow
              label="마감임박 알림"
              sub="관심 공구 마감 24시간 전에 알려드려요"
              enabled={notif.closing}
              onToggle={() => toggleNotif('closing')}
            />
            <ToggleRow
              label="관심 카테고리 알림"
              sub="설정한 카테고리 공구만 알려드려요"
              enabled={notif.category}
              onToggle={() => toggleNotif('category')}
            />
            {notifSaving && (
              <p className="text-[11px] text-stone-400 py-2 text-center">저장 중...</p>
            )}
          </div>
        </Section>

        {/* ── Footer links ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-4 py-2">
          <button
            onClick={() => navigate('/privacy')}
            className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            개인정보처리방침
          </button>
          <span className="text-stone-200 text-xs">|</span>
          <button
            onClick={() => navigate('/terms')}
            className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            이용약관
          </button>
        </div>

      </div>

      <BottomNav />
    </div>
  );
}