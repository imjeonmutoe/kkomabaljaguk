import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DEAL_CATEGORIES } from '../lib/categories';
import { useAdminAuth } from '../hooks/useAdminAuth';
import type { Deal, NaverProduct } from '../types';

const OCR_SERVER = import.meta.env.VITE_OCR_SERVER_URL as string;

// ── Types ────────────────────────────────────────────────────────────────────

type TabStatus = '전체' | 'pending' | 'approved' | 'rejected';

interface EditForm {
  productName: string;
  brand: string;
  category: string;
  startAt: string;   // datetime-local
  endAt: string;     // datetime-local
  price: string;
  instagramUrl: string;
  naverProducts: NaverProduct[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────


function tsToMs(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === 'string') return new Date(v).getTime();
  if (typeof (v as { toMillis?: unknown }).toMillis === 'function')
    return (v as { toMillis: () => number }).toMillis();
  return null;
}

function tsToDatetimeLocal(ts: unknown): string {
  const ms = tsToMs(ts);
  if (ms == null) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(ts: unknown): string {
  const ms = tsToMs(ts);
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="bg-white rounded-2xl p-4 animate-pulse flex items-center gap-3">
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/4 bg-gray-200 rounded" />
        <div className="h-4 w-1/2 bg-gray-200 rounded" />
      </div>
      <div className="flex gap-2">
        <div className="h-8 w-12 bg-gray-200 rounded-lg" />
        <div className="h-8 w-12 bg-gray-200 rounded-lg" />
        <div className="h-8 w-12 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

function DeleteConfirmModal({ onConfirm, onCancel, deleting }: DeleteConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-lg border border-stone-200 w-full max-w-sm p-6">
        <h2 className="text-base font-bold text-stone-900 mb-2">딜 삭제</h2>
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
    </div>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  deal: Deal;
  onClose: () => void;
  onSave: (dealId: string, data: Partial<Deal>) => Promise<void>;
}

function EditModal({ deal, onClose, onSave }: EditModalProps) {
  const [form, setForm] = useState<EditForm>({
    productName: deal.productName,
    brand: deal.brand,
    category: deal.category,
    startAt: tsToDatetimeLocal(deal.startAt),
    endAt: tsToDatetimeLocal(deal.endAt),
    price: deal.price > 0 ? String(deal.price) : '',
    instagramUrl: deal.instagramUrl,
    naverProducts: deal.naverProducts ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [naverError, setNaverError] = useState('');

  const set = (key: keyof EditForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleNaverRefresh = async () => {
    const q = form.productName.trim();
    if (!q) return;
    setRefreshing(true);
    setNaverError('');
    try {
      const res = await fetch(`${OCR_SERVER}/naver-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error('서버 오류');
      const data = await res.json() as { naverProducts: NaverProduct[] };
      setForm((prev) => ({ ...prev, naverProducts: data.naverProducts }));
    } catch {
      setNaverError('Naver 상품 새로고침에 실패했어요.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(deal.id, {
        productName: form.productName.trim(),
        brand: form.brand.trim(),
        category: form.category,
        startAt: Timestamp.fromDate(new Date(form.startAt)),
        endAt: Timestamp.fromDate(new Date(form.endAt)),
        price: Number(form.price) || 0,
        instagramUrl: form.instagramUrl.trim(),
        naverProducts: form.naverProducts,
      });
      onClose();
    } catch {
      alert('저장에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto">

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-3xl sm:rounded-t-3xl z-10">
          <h2 className="text-sm font-bold text-gray-900">딜 수정</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">

          {/* Product name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">상품명</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.productName}
              onChange={(e) => set('productName', e.target.value)}
            />
          </div>

          {/* Brand */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">브랜드</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.brand}
              onChange={(e) => set('brand', e.target.value)}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">카테고리</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              {DEAL_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">시작일시</label>
              <input
                type="datetime-local"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.startAt}
                onChange={(e) => set('startAt', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">종료일시</label>
              <input
                type="datetime-local"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.endAt}
                onChange={(e) => set('endAt', e.target.value)}
              />
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">가격 (원)</label>
            <input
              type="number"
              min="0"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </div>

          {/* Instagram URL */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">인스타그램 URL</label>
            <input
              type="url"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.instagramUrl}
              onChange={(e) => set('instagramUrl', e.target.value)}
            />
          </div>

          {/* Naver Products */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600">
                네이버 상품 ({form.naverProducts.length}개)
              </label>
              <button
                type="button"
                onClick={handleNaverRefresh}
                disabled={refreshing}
                className="flex items-center gap-1 text-xs text-primary font-medium px-2 py-1 rounded-lg border border-primary/30 hover:bg-primary/5 disabled:opacity-50 transition-colors"
              >
                {refreshing ? (
                  <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                Naver 새로고침
              </button>
            </div>

            {naverError && (
              <p className="text-xs text-red-500 mb-2">{naverError}</p>
            )}

            {form.naverProducts.length > 0 ? (
              <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                {form.naverProducts.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs border border-gray-100 rounded-xl p-2">
                    {p.image && (
                      <img src={p.image} alt="" className="w-8 h-8 object-cover rounded-lg flex-shrink-0" loading="lazy" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-gray-800 truncate">{p.title}</p>
                      <p className="text-gray-400">{Number(p.lprice).toLocaleString()}원 · {p.mallName}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">상품 없음 — 상품명 입력 후 새로고침을 눌러주세요.</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1 pb-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** 관리자 대시보드 — Google 로그인 + admins 컬렉션 인증 */
export function Admin() {
  const navigate = useNavigate();
  const { status, error: authError, signInWithGoogle, signOut } = useAdminAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabStatus>('pending');
  const [actionId, setActionId] = useState<string | null>(null);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [deletingDeal, setDeletingDeal] = useState<Deal | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  // ── Realtime listener (admin only) ────────────────────────────────────────

  useEffect(() => {
    if (status !== 'admin') return;
    const q = query(collection(db, 'deals'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDeals(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Deal, 'id'>) })));
        setLoading(false);
      },
      (err) => {
        // Permission denied on sign-out is expected — ignore silently
        if (err.code !== 'permission-denied') {
          console.error('[Admin] onSnapshot error:', err);
        }
        setLoading(false);
      }
    );
    return unsub;
  }, [status]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const pendingCount = deals.filter((d) => d.status === 'pending').length;

  const todayStr = new Date().toDateString();
  const approvedToday = deals.filter((d) => {
    if (d.status !== 'approved' || !d.approvedAt) return false;
    return d.approvedAt.toDate().toDateString() === todayStr;
  }).length;

  const totalDeals = deals.length;

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = tab === '전체' ? deals : deals.filter((d) => d.status === tab);

  // ── Actions ───────────────────────────────────────────────────────────────

  const updateStatus = useCallback(async (
    dealId: string,
    status: 'approved' | 'rejected'
  ) => {
    setActionId(dealId);
    try {
      const data: Record<string, unknown> = { status };
      if (status === 'approved') data['approvedAt'] = Timestamp.now();
      await updateDoc(doc(db, 'deals', dealId), data);
    } catch (err) {
      console.error('[Admin] updateDoc error:', err);
      alert('오류가 발생했어요. 다시 시도해 주세요.');
    } finally {
      setActionId(null);
    }
  }, []);

  const saveEdit = useCallback(async (dealId: string, data: Partial<Deal>) => {
    await updateDoc(doc(db, 'deals', dealId), data as Record<string, unknown>);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deletingDeal) return;
    setDeleteInProgress(true);
    try {
      await deleteDoc(doc(db, 'deals', deletingDeal.id));
      setDeletingDeal(null);
    } catch (err) {
      console.error('[Admin] deleteDoc error:', err);
      alert('삭제에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setDeleteInProgress(false);
    }
  }, [deletingDeal]);

  // ── Auth states ───────────────────────────────────────────────────────────

  if (status === 'loading' || status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated' || status === 'denied') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-sm p-8 w-full max-w-sm text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 10.05c0 5.428 3.657 10 8.785 11.193.48.113.97.113 1.43 0C18.343 20.05 22 15.478 22 10.05c0-1.4-.24-2.747-.682-4.005" />
            </svg>
          </div>
          <h1 className="text-base font-bold text-gray-900 mb-1">관리자 로그인</h1>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            {status === 'denied'
              ? '관리자 권한이 없는 계정이에요.\n다른 Google 계정으로 로그인해 주세요.'
              : '관리자 페이지에 접근하려면\nGoogle 계정으로 로그인하세요.'}
          </p>
          {authError && (
            <p className="text-xs text-red-500 mb-4">{authError}</p>
          )}
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all shadow-sm mb-3"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google 계정으로 로그인
          </button>
          <button
            onClick={() => navigate('/')}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            타임라인으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // ── Render (admin confirmed) ──────────────────────────────────────────────

  const TABS: { label: string; value: TabStatus }[] = [
    { label: '전체', value: '전체' },
    { label: `대기중 ${pendingCount > 0 ? `(${pendingCount})` : ''}`, value: 'pending' },
    { label: '승인됨', value: 'approved' },
    { label: '거절됨', value: 'rejected' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="홈으로"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-sm font-bold text-gray-900 flex-1">관리자 대시보드</h1>
          <button
            onClick={signOut}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            로그아웃
          </button>
        </div>

        {/* ── Stats bar ──────────────────────────────────────────────────── */}
        <div className="max-w-2xl mx-auto px-4 pb-3 grid grid-cols-3 gap-3">
          <div className="bg-amber-50 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-bold text-amber-600">{pendingCount}</p>
            <p className="text-xs text-amber-500 mt-0.5">대기중</p>
          </div>
          <div className="bg-green-50 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-bold text-green-600">{approvedToday}</p>
            <p className="text-xs text-green-500 mt-0.5">오늘 승인</p>
          </div>
          <div className="bg-blue-50 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-bold text-primary">{totalDeals}</p>
            <p className="text-xs text-blue-400 mt-0.5">전체 딜</p>
          </div>
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}>
          {TABS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`
                flex-shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors
                ${tab === value
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
              `}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Deal list ──────────────────────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-4 py-4">

        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => <SkeletonRow key={i} />)}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-20 text-gray-400 text-sm">
            {tab === 'pending'
              ? '대기 중인 제보가 없어요.'
              : '해당 항목이 없어요.'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex flex-col gap-3">
            {filtered.map((deal) => {
              const isOcr = !deal.instagramUrl;
              const busy = actionId === deal.id;

              return (
                <div key={deal.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                  {/* Top row: meta + badges */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs text-gray-400">{deal.category}</span>
                    {deal.brand && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400">{deal.brand}</span>
                      </>
                    )}
                    <span className="text-gray-200">·</span>
                    <span className="text-xs text-gray-400">{formatDate(deal.createdAt)} 제보</span>

                    {isOcr && (
                      <span className="ml-auto text-[10px] font-semibold bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">
                        OCR
                      </span>
                    )}
                    {deal.naverProducts?.length > 0 && (
                      <span className={`text-[10px] font-semibold bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full ${isOcr ? '' : 'ml-auto'}`}>
                        N {deal.naverProducts.length}
                      </span>
                    )}
                  </div>

                  {/* Product name */}
                  <p className="text-sm font-bold text-gray-900 mb-1 leading-snug">
                    {deal.productName}
                  </p>

                  {/* Instagram link */}
                  {deal.instagramUrl && (
                    <a
                      href={deal.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary truncate block mb-2 hover:underline"
                    >
                      {deal.instagramUrl}
                    </a>
                  )}

                  {/* Status badge for non-pending */}
                  {deal.status !== 'pending' && (
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2
                      ${deal.status === 'approved'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-red-100 text-red-500'}`}>
                      {deal.status === 'approved' ? '승인됨' : '거절됨'}
                    </span>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-2">
                    {deal.status === 'pending' && (
                      <>
                        <button
                          onClick={() => updateStatus(deal.id, 'approved')}
                          disabled={busy}
                          className="text-xs bg-green-500 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => updateStatus(deal.id, 'rejected')}
                          disabled={busy}
                          className="text-xs bg-red-100 text-red-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
                        >
                          거절
                        </button>
                      </>
                    )}
                    {deal.status === 'approved' && (
                      <button
                        onClick={() => updateStatus(deal.id, 'rejected')}
                        disabled={busy}
                        className="text-xs bg-red-100 text-red-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-200 disabled:opacity-50 transition-colors"
                      >
                        거절로 변경
                      </button>
                    )}
                    {deal.status === 'rejected' && (
                      <button
                        onClick={() => updateStatus(deal.id, 'approved')}
                        disabled={busy}
                        className="text-xs bg-green-500 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
                      >
                        승인으로 변경
                      </button>
                    )}
                    <button
                      onClick={() => setEditingDeal(deal)}
                      disabled={busy}
                      className="text-xs bg-blue-100 text-primary font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-200 disabled:opacity-50 transition-colors"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => setDeletingDeal(deal)}
                      disabled={busy}
                      className="text-xs bg-red-500 hover:bg-red-600 text-white font-semibold px-3 py-1.5 rounded-xl disabled:opacity-50 transition-colors"
                    >
                      삭제
                    </button>
                    {busy && (
                      <span className="flex items-center">
                        <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Edit Modal ─────────────────────────────────────────────────────── */}
      {editingDeal && (
        <EditModal
          deal={editingDeal}
          onClose={() => setEditingDeal(null)}
          onSave={saveEdit}
        />
      )}

      {/* ── Delete Confirm Modal ────────────────────────────────────────────── */}
      {deletingDeal && (
        <DeleteConfirmModal
          onConfirm={handleDelete}
          onCancel={() => setDeletingDeal(null)}
          deleting={deleteInProgress}
        />
      )}
    </div>
  );
}