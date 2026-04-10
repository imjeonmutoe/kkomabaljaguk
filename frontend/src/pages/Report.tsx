import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, addDoc, serverTimestamp, getDoc, doc,
  query, where, getDocs, updateDoc,
} from 'firebase/firestore';
import { ImageOff } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { Footer } from '../components/Footer';
import { DEAL_CATEGORIES } from '../lib/categories';

const OCR_API_URL = (import.meta.env.VITE_OCR_SERVER_URL as string | undefined) ?? '';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// ── Types ─────────────────────────────────────────────────────────────────────

type InputMode = 'idle' | 'inpock' | 'srookpay' | 'ocr';
type UserRole = 'user' | 'influencer' | 'admin';

interface CommonFields {
  category: string;
  startAt: string; // datetime-local: "YYYY-MM-DDTHH:mm"
  endAt: string;
}

interface InpockItem {
  id: string;
  title: string;
  imageUrl: string;
  url: string;
  openAt: string | null;   // datetime-local
  openUntil: string | null; // datetime-local
  checked: boolean;
  category: string; // per-item category selection
}

interface SrookpayForm {
  productName: string;
  thumbnailUrl: string;
  price: string;
  originalPrice: string;
  sourceUrl: string;
  instagramUrl: string;
}

interface OcrResult {
  productName: string | null;
  price: number | null;
  startAt: string | null; // "YYYY-MM-DD"
  endAt: string | null;   // "YYYY-MM-DD"
  rawLines: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_COMMON: CommonFields = { category: '', startAt: '', endAt: '' };

/** ISO/date string → datetime-local "YYYY-MM-DDTHH:mm" */
function toDatetimeLocal(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 16).replace(' ', 'T');
}

function nowDatetimeLocal(): string {
  return new Date().toISOString().slice(0, 16);
}

function detectMode(url: string): Exclude<InputMode, 'ocr'> {
  if (url.includes('link.inpock.co.kr/')) return 'inpock';
  if (url.includes('shop.srookpay.com/') || url.includes('srok.kr/')) return 'srookpay';
  return 'idle';
}

/** Prepend https: to protocol-relative URLs */
function fixUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url;
}

/** Normalize inpock image URLs: protocol-relative, relative, or absolute */
function fixInpockImageUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http')) return url;
  return `https://link.inpock.co.kr/${url}`;
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-stone-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-stone-400">{hint}</p>}
      {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
    </div>
  );
}

// ── Input class helper ─────────────────────────────────────────────────────────

function inputCls(highlighted = false): string {
  return [
    'border rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400',
    'focus:outline-none focus:ring-1 focus:border-orange-400 focus:ring-orange-400 transition-colors',
    highlighted
      ? 'border-orange-300 bg-orange-50/40'
      : 'border-stone-200 bg-white',
  ].join(' ');
}

// ── Success screen ─────────────────────────────────────────────────────────────

function SuccessScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-orange-50 flex items-center justify-center p-6">
      <div className="text-center max-w-xs">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-base font-bold text-stone-900 mb-2">제보가 접수됐어요!</h2>
        <p className="text-sm text-stone-500 mb-6 leading-relaxed">
          검토 후 24시간 내 게시됩니다.<br />승인되면 타임라인에 나타나요.
        </p>
        <button
          onClick={onBack}
          className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-8 rounded-xl text-sm active:scale-[0.98] transition-all"
        >
          타임라인으로
        </button>
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** 공구 제보 페이지 — 단일 입력창으로 링크 유형 자동 감지 */
export function Report() {
  const navigate = useNavigate();

  // User role — admin detected via Firestore admins/{uid}
  const [userRole, setUserRole] = useState<UserRole>('user');

  // Input state
  const [linkInput, setLinkInput] = useState('');
  const [mode, setMode] = useState<InputMode>('idle');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Inpock mode
  const [inpockItems, setInpockItems] = useState<InpockItem[]>([]);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const [inpockCategoryErrors, setInpockCategoryErrors] = useState<Record<string, boolean>>({});

  // Srookpay mode
  const [srookpayForm, setSrookpayForm] = useState<SrookpayForm>({
    productName: '', thumbnailUrl: '', price: '', originalPrice: '', sourceUrl: '', instagramUrl: '',
  });

  // OCR mode
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrLines, setOcrLines] = useState<string[]>([]);
  const [ocrAutoFilled, setOcrAutoFilled] = useState(false);
  const [ocrProductName, setOcrProductName] = useState('');
  const [ocrPrice, setOcrPrice] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Common fields (category, dates)
  const [common, setCommon] = useState<CommonFields>(EMPTY_COMMON);
  const [categoryError, setCategoryError] = useState('');

  // Inpock instagram lookup
  const [inpockInfluencerId, setInpockInfluencerId] = useState<string | null>(null);
  const [inpockInstagramUrl, setInpockInstagramUrl] = useState('');
  const [showInstagramInput, setShowInstagramInput] = useState(false);
  const [instagramInputError, setInstagramInputError] = useState('');

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Detect admin role on mount
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'admins', uid))
      .then((snap) => { if (snap.exists()) setUserRole('admin'); })
      .catch(() => {});
  }, []);

  // Revoke image object URL on unmount
  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

  const isPrivileged = userRole === 'admin' || userRole === 'influencer';

  // ── Common field helpers ──────────────────────────────────────────────────
  function setCommonField<K extends keyof CommonFields>(key: K, value: string) {
    setCommon((p) => ({ ...p, [key]: value }));
    if (key === 'category') setCategoryError('');
  }

  // ── Link input ────────────────────────────────────────────────────────────
  function handleLinkChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLinkInput(e.target.value);
    setParseError(null);
    setInpockInfluencerId(null);
    setInpockInstagramUrl('');
    setShowInstagramInput(false);
    setInstagramInputError('');
  }

  async function handleParse() {
    const url = linkInput.trim();
    if (!url || parsing) return;

    const detected = detectMode(url);
    if (detected === 'idle') {
      setParseError('지원하지 않는 링크예요. 인포크(link.inpock.co.kr) 또는 스룩페이(srok.kr, shop.srookpay.com) 링크를 입력해 주세요.');
      return;
    }

    setParsing(true);
    setParseError(null);
    setMode(detected);

    try {
      if (detected === 'inpock') {
        await parseInpock(url);
        await lookupInpockInfluencer(url);
      } else {
        await parseSrookpay(url);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '파싱 중 오류가 발생했어요.');
      setMode('idle');
    } finally {
      setParsing(false);
    }
  }

  // ── Inpock parsing ─────────────────────────────────────────────────────────
  async function parseInpock(url: string) {
    if (!OCR_API_URL) throw new Error('서버 URL이 설정되지 않았어요.');

    const res = await fetch(`${OCR_API_URL}/parse-inpock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { detail?: string };
      throw new Error(body.detail ?? `파싱 오류 (${res.status})`);
    }

    type RawBlock = {
      title: string;
      image: string;
      url: string;
      open_at: string | null;
      open_until: string | null;
      block_type: string;
    };
    const blocks: RawBlock[] = await res.json();

    // Exclude social/doc links; include all other blocks that have a URL
    const EXCLUDED_PATTERNS = ['kakao', 'brand', 'drive.google.com', 'docs.google.com'];
    const items = blocks.filter((b) => {
      if (!b.url) return false;
      if (b.url.startsWith('mailto:')) return false;
      if (EXCLUDED_PATTERNS.some((p) => b.url.includes(p))) return false;
      return true;
    });

    setImgErrors({});
    setInpockItems(
      items.map((item, i) => ({
        id: String(i),
        title: item.title,
        imageUrl: item.image ? fixInpockImageUrl(item.image) : '',
        url: item.url,
        openAt: item.open_at ? toDatetimeLocal(item.open_at) : null,
        openUntil: item.open_until ? toDatetimeLocal(item.open_until) : null,
        checked: true,
        category: '',
      })),
    );
  }

  // ── Inpock influencer lookup ───────────────────────────────────────────────
  async function lookupInpockInfluencer(url: string) {
    const username = (() => {
      try {
        const normalized = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
        return new URL(normalized).pathname.split('/').filter(Boolean)[0] ?? '';
      } catch { return ''; }
    })();
    if (!username) { setShowInstagramInput(true); return; }

    try {
      const snap = await getDocs(
        query(collection(db, 'influencers'), where('inpockUrl', '==', `link.inpock.co.kr/${username}`)),
      );
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const data = docSnap.data();
        // Fall back to constructing instagramUrl from instagramId if the field is missing
        const instagramId = (data.instagramId as string | undefined) ?? '';
        const igUrl =
          (data.instagramUrl as string | undefined) ||
          (instagramId ? `https://www.instagram.com/${instagramId}/` : '');
        setInpockInfluencerId(docSnap.id);
        setInpockInstagramUrl(igUrl);
        setShowInstagramInput(!igUrl);
      } else {
        setInpockInfluencerId(null);
        setShowInstagramInput(true);
      }
    } catch {
      setInpockInfluencerId(null);
      setShowInstagramInput(true);
    }
  }

  // ── Srookpay parsing ───────────────────────────────────────────────────────
  async function parseSrookpay(url: string) {
    if (!OCR_API_URL) throw new Error('서버 URL이 설정되지 않았어요.');

    const res = await fetch(`${OCR_API_URL}/parse-srookpay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { detail?: string };
      throw new Error(body.detail ?? `파싱 오류 (${res.status})`);
    }

    type SrookpayResult = {
      productName: string;
      thumbnailUrl: string;
      price: string;
      originalPrice: string;
    };
    const data: SrookpayResult = await res.json();

    setSrookpayForm({
      productName: data.productName ?? '',
      thumbnailUrl: data.thumbnailUrl ? fixUrl(data.thumbnailUrl) : '',
      price: data.price ?? '',
      originalPrice: data.originalPrice ?? '',
      sourceUrl: url,
      instagramUrl: '',
    });
  }

  // ── Image selection ────────────────────────────────────────────────────────
  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_BYTES) {
      setOcrError('이미지 파일은 5MB 이하여야 해요.');
      return;
    }

    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setOcrError(null);
    setOcrAutoFilled(false);
    setOcrLines([]);
    setOcrProductName('');
    setOcrPrice('');
    setMode('ocr');
    setLinkInput('');
    setParseError(null);
  }

  // ── OCR extraction ─────────────────────────────────────────────────────────
  async function handleOcrExtract() {
    if (!imageFile || ocrLoading) return;
    if (!OCR_API_URL) {
      setOcrError('OCR 서버 URL이 설정되지 않았어요.');
      return;
    }

    setOcrLoading(true);
    setOcrError(null);
    setOcrAutoFilled(false);

    try {
      const formData = new FormData();
      formData.append('file', imageFile);

      const res = await fetch(`${OCR_API_URL}/ocr`, { method: 'POST', body: formData });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(body.detail ?? `서버 오류 (${res.status})`);
      }

      // OCR server returns { ok, docId, data: { productName, price, startAt, endAt, rawLines } }
      const resp = await res.json() as { data: OcrResult };
      const data = resp.data ?? (resp as unknown as OcrResult);

      setOcrProductName(data.productName ?? '');
      setOcrPrice(data.price != null ? String(data.price) : '');
      if (data.startAt) setCommon((p) => ({ ...p, startAt: `${data.startAt}T00:00` }));
      if (data.endAt) setCommon((p) => ({ ...p, endAt: `${data.endAt}T00:00` }));
      setOcrLines(data.rawLines ?? []);
      setOcrAutoFilled(true);
      setCategoryError('');
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : 'OCR 처리 중 오류가 발생했어요.');
    } finally {
      setOcrLoading(false);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === 'inpock') {
      const checked = inpockItems.filter((i) => i.checked);
      if (checked.length === 0) {
        setParseError('제보할 항목을 하나 이상 선택해 주세요.');
        return;
      }
      const missingCategory = checked.filter((i) => !i.category);
      if (missingCategory.length > 0) {
        const errors: Record<string, boolean> = {};
        missingCategory.forEach((i) => { errors[i.id] = true; });
        setInpockCategoryErrors(errors);
        return;
      }
      const igUrl = inpockInstagramUrl.trim();
      if (igUrl && !igUrl.includes('instagram.com')) {
        setInstagramInputError('올바른 인스타그램 주소를 입력해주세요');
        return;
      }
    } else {
      if (!common.category) {
        setCategoryError('카테고리를 선택해 주세요.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const uid = auth.currentUser?.uid ?? '';
      const reporterRole: 'user' | 'influencer' =
        userRole === 'admin' || userRole === 'influencer' ? 'influencer' : 'user';

      const base = {
        category: common.category,
        startAt: common.startAt ? new Date(common.startAt) : null,
        endAt: common.endAt ? new Date(common.endAt) : null,
        status: 'pending',
        reporterId: uid,
        reporterRole,
        createdAt: serverTimestamp(),
        viewCount: 0,
        oembedHtml: '',
        naverProducts: [],
        naverUpdatedAt: null,
        brand: '',
      };

      if (mode === 'inpock') {
        const checked = inpockItems.filter((i) => i.checked);
        // Extract influencer username from inpock URL (link.inpock.co.kr/{username})
        const inpockBrand = (() => {
          try {
            const normalized = linkInput.trim().startsWith('http') ? linkInput.trim() : `https://${linkInput.trim()}`;
            return new URL(normalized).pathname.split('/').filter(Boolean)[0] ?? '';
          } catch {
            return '';
          }
        })();
        const instagramUrl = inpockInstagramUrl.trim();
        const instagramId = instagramUrl
          ? instagramUrl.replace(/\/$/, '').split('/').filter(Boolean).pop() ?? ''
          : '';
        // Update influencer doc with instagram info if newly provided
        if (instagramUrl && inpockInfluencerId) {
          await updateDoc(doc(db, 'influencers', inpockInfluencerId), { instagramUrl, instagramId });
        }
        await Promise.all(
          checked.map((item) => {
            const dealData = {
              ...base,
              brand: inpockBrand,
              category: item.category, // per-item category
              productName: item.title,
              thumbnailUrl: item.imageUrl,
              sourceUrl: item.url,
              instagramUrl,
              instagramId,
              startAt: item.openAt ? new Date(item.openAt) : null,
              endAt: item.openUntil ? new Date(item.openUntil) : null,
              price: 0,
              originalPrice: 0,
            };
            // DEBUG: log full deal data before save — remove after diagnosis
            console.log('[Report] dealData before save:', {
              brand: dealData.brand,
              instagramUrl: dealData.instagramUrl,
              instagramId: dealData.instagramId,
              linkInput,
              inpockBrand,
              inpockInstagramUrl,
              inpockInfluencerId,
              full: dealData,
            });
            return addDoc(collection(db, 'deals'), dealData);
          }),
        );
      } else if (mode === 'srookpay') {
        const parseNum = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
        await addDoc(collection(db, 'deals'), {
          ...base,
          productName: srookpayForm.productName,
          thumbnailUrl: srookpayForm.thumbnailUrl,
          sourceUrl: srookpayForm.sourceUrl,
          instagramUrl: srookpayForm.instagramUrl,
          price: parseNum(srookpayForm.price),
          originalPrice: parseNum(srookpayForm.originalPrice),
        });
      } else if (mode === 'ocr') {
        await addDoc(collection(db, 'deals'), {
          ...base,
          productName: ocrProductName,
          thumbnailUrl: '',
          sourceUrl: '',
          instagramUrl: '',
          price: parseInt(ocrPrice, 10) || 0,
          originalPrice: 0,
        });
      }

      setSuccess(true);
    } catch (err) {
      console.error('[Report] submit error:', err);
      setParseError('제출 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render guards ──────────────────────────────────────────────────────────
  if (success) return <SuccessScreen onBack={() => navigate('/')} />;

  // Inpock mode has per-item fields; common fields shown only for srookpay/ocr
  const showCommonFields = mode === 'srookpay' || mode === 'ocr';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-orange-50 pb-10">

      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="뒤로 가기"
            className="p-2 -ml-2 rounded-full hover:bg-orange-50 active:bg-orange-100 transition-colors"
          >
            <svg className="w-5 h-5 text-stone-600" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-sm font-bold text-stone-900">공구 제보하기</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} noValidate className="max-w-lg mx-auto px-4 pt-4 flex flex-col gap-4">

        {/* ── Input card ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-stone-700">공구 링크 또는 이미지</p>

          {/* Link input row */}
          <div className="flex gap-2">
            <input
              type="url"
              value={linkInput}
              onChange={handleLinkChange}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleParse(); } }}
              placeholder="link.inpock.co.kr/... 또는 srok.kr/..."
              autoComplete="off"
              className="flex-1 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:border-orange-400 focus:ring-orange-400 transition-colors"
            />
            <button
              type="button"
              onClick={handleParse}
              disabled={!linkInput.trim() || parsing}
              className="flex items-center justify-center w-16 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {parsing ? <Spinner /> : '파싱'}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-[11px] text-stone-400 select-none">또는</span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>

          {/* Image upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 border border-stone-200 hover:border-orange-400 rounded-xl px-4 py-2.5 text-sm text-stone-500 hover:text-orange-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            이미지로 제보하기
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImageChange}
          />

          {parseError && (
            <p className="text-xs text-red-500 font-medium">{parseError}</p>
          )}
        </div>

        {/* ── Inpock mode: checkbox list ───────────────────────────────── */}
        {mode === 'inpock' && inpockItems.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
              <p className="text-sm font-bold text-stone-900">
                공구 목록{' '}
                <span className="text-orange-500">{inpockItems.length}개</span>
              </p>
              {isPrivileged && (
                <button
                  type="button"
                  onClick={() => setInpockItems((p) => p.map((i) => ({ ...i, checked: true })))}
                  className="text-xs font-semibold text-orange-500 hover:text-orange-600 transition-colors"
                >
                  전체 선택
                </button>
              )}
            </div>
            <ul className="divide-y divide-stone-100">
              {inpockItems.map((item) => (
                <li key={item.id} className="px-4 py-3 flex flex-col gap-2">
                  {/* Thumbnail — full width, fixed height */}
                  {item.imageUrl && (
                    <div className="h-32 w-full overflow-hidden rounded-lg bg-stone-100">
                      {imgErrors[item.id] ? (
                        <div className="h-full w-full flex items-center justify-center bg-stone-100">
                          <ImageOff className="w-8 h-8 text-stone-400" />
                        </div>
                      ) : (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={() => setImgErrors((p) => ({ ...p, [item.id]: true }))}
                        />
                      )}
                    </div>
                  )}
                  {/* Checkbox + title row */}
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={`item-${item.id}`}
                      checked={item.checked}
                      onChange={(e) =>
                        setInpockItems((p) =>
                          p.map((i) =>
                            i.id === item.id ? { ...i, checked: e.target.checked } : i,
                          ),
                        )
                      }
                      className="w-4 h-4 rounded accent-orange-500 cursor-pointer flex-shrink-0 mt-1"
                    />
                    <label htmlFor={`item-${item.id}`} className="flex-1 cursor-pointer min-w-0">
                      <p className="text-sm font-medium text-stone-900 line-clamp-2">{item.title}</p>
                    </label>
                  </div>
                  {/* Per-item fields: category + dates */}
                  <div className="ml-7 flex flex-col gap-2">
                    <select
                      value={item.category}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInpockItems((p) =>
                          p.map((i) =>
                            i.id === item.id ? { ...i, category: val } : i,
                          )
                        );
                        if (val) {
                          setInpockCategoryErrors((p) => { const next = { ...p }; delete next[item.id]; return next; });
                        }
                      }}
                      className="border border-stone-200 bg-white rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:border-orange-400 focus:ring-orange-400 transition-colors"
                    >
                      <option value="">카테고리 선택</option>
                      {DEAL_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                    {item.checked && inpockCategoryErrors[item.id] && (
                      <p className="text-red-500 text-sm">카테고리를 선택해 주세요.</p>
                    )}
                    {(item.openAt !== null || item.openUntil !== null) && (
                      <div className="grid grid-cols-2 gap-2">
                        {item.openAt !== null && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] text-stone-500">시작일</span>
                            <input
                              type="datetime-local"
                              value={item.openAt}
                              onChange={(e) =>
                                setInpockItems((p) =>
                                  p.map((i) =>
                                    i.id === item.id ? { ...i, openAt: e.target.value } : i,
                                  )
                                )
                              }
                              className="border border-stone-200 bg-white rounded-xl px-2 py-1.5 text-[11px] text-stone-900 focus:outline-none focus:ring-1 focus:border-orange-400 focus:ring-orange-400 transition-colors"
                            />
                          </div>
                        )}
                        {item.openUntil !== null && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] text-stone-500">종료일</span>
                            <input
                              type="datetime-local"
                              value={item.openUntil}
                              onChange={(e) =>
                                setInpockItems((p) =>
                                  p.map((i) =>
                                    i.id === item.id ? { ...i, openUntil: e.target.value } : i,
                                  )
                                )
                              }
                              className="border border-stone-200 bg-white rounded-xl px-2 py-1.5 text-[11px] text-stone-900 focus:outline-none focus:ring-1 focus:border-orange-400 focus:ring-orange-400 transition-colors"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Srookpay mode: product preview form ─────────────────────── */}
        {mode === 'srookpay' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-4 flex flex-col gap-4">
            <p className="text-sm font-bold text-stone-900">상품 정보</p>

            {srookpayForm.thumbnailUrl && (
              <img
                src={srookpayForm.thumbnailUrl}
                alt={srookpayForm.productName}
                loading="lazy"
                className="w-full max-h-52 object-contain rounded-xl bg-stone-50"
              />
            )}

            <Field label="상품명">
              <input
                type="text"
                value={srookpayForm.productName}
                onChange={(e) => setSrookpayForm((p) => ({ ...p, productName: e.target.value }))}
                className={inputCls(!!srookpayForm.productName)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="공구가">
                <input
                  type="text"
                  value={srookpayForm.price}
                  onChange={(e) => setSrookpayForm((p) => ({ ...p, price: e.target.value }))}
                  placeholder="예) 79,000원"
                  className={inputCls(!!srookpayForm.price)}
                />
              </Field>
              <Field label="정가">
                <input
                  type="text"
                  value={srookpayForm.originalPrice}
                  onChange={(e) => setSrookpayForm((p) => ({ ...p, originalPrice: e.target.value }))}
                  placeholder="예) 129,000원"
                  className={inputCls(!!srookpayForm.originalPrice)}
                />
              </Field>
            </div>

            <Field label="인스타그램 URL" hint="알고 있다면 입력해 주세요 (선택)">
              <input
                type="url"
                value={srookpayForm.instagramUrl}
                onChange={(e) => setSrookpayForm((p) => ({ ...p, instagramUrl: e.target.value }))}
                placeholder="https://www.instagram.com/p/..."
                className={inputCls()}
              />
            </Field>
          </div>
        )}

        {/* ── OCR mode: image preview + AI extraction ──────────────────── */}
        {mode === 'ocr' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-4 flex flex-col gap-3">
            <p className="text-sm font-bold text-stone-900">이미지 OCR</p>

            {imagePreview && (
              <img
                src={imagePreview}
                alt="업로드된 이미지"
                className="w-full max-h-64 object-contain rounded-xl bg-stone-50"
              />
            )}

            {/* AI extract button */}
            <button
              type="button"
              onClick={handleOcrExtract}
              disabled={!imageFile || ocrLoading}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
            >
              {ocrLoading ? (
                <><Spinner /> AI 분석 중...</>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI 자동 추출
                </>
              )}
            </button>

            {ocrError && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-xs text-red-600">
                {ocrError}
              </div>
            )}

            {/* Auto-fill success notice */}
            {ocrAutoFilled && (
              <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-700 mb-1.5">
                  ✓ 자동 추출 완료 — 내용을 확인하고 수정하세요
                </p>
                {ocrLines.length > 0 && (
                  <details className="group">
                    <summary className="text-[11px] text-green-600 cursor-pointer select-none group-open:mb-2">
                      추출된 텍스트 {ocrLines.length}줄 보기
                    </summary>
                    <div className="bg-white/60 rounded-lg p-2 max-h-28 overflow-y-auto">
                      {ocrLines.map((line, i) => (
                        <p key={i} className="text-[11px] text-stone-600 leading-relaxed">{line}</p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* OCR-specific form fields */}
            <Field label="상품명">
              <input
                type="text"
                value={ocrProductName}
                onChange={(e) => setOcrProductName(e.target.value)}
                placeholder="AI 추출 후 수정 가능"
                className={inputCls(ocrAutoFilled && !!ocrProductName)}
              />
            </Field>

            <Field label="가격 (원)" hint="미정이면 비워두세요">
              <input
                type="number"
                value={ocrPrice}
                onChange={(e) => setOcrPrice(e.target.value)}
                placeholder="0"
                min="0"
                step="100"
                className={inputCls(ocrAutoFilled && !!ocrPrice)}
              />
            </Field>
          </div>
        )}

        {/* ── Common fields: category + dates ─────────────────────────── */}
        {showCommonFields && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-4 flex flex-col gap-4">
            <p className="text-sm font-bold text-stone-900">공통 정보</p>

            <Field label="카테고리" required error={categoryError}>
              <select
                value={common.category}
                onChange={(e) => setCommonField('category', e.target.value)}
                className="border border-stone-200 bg-white rounded-xl px-3 py-2.5 text-sm text-stone-900 focus:outline-none focus:ring-1 focus:border-orange-400 focus:ring-orange-400 transition-colors"
              >
                <option value="">선택해 주세요</option>
                {DEAL_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="시작일" hint="미정이면 비워두세요">
                <input
                  type="datetime-local"
                  value={common.startAt}
                  onChange={(e) => setCommonField('startAt', e.target.value)}
                  className={`${inputCls(ocrAutoFilled && !!common.startAt)} text-xs`}
                />
              </Field>
              <Field label="종료일" hint="미정이면 비워두세요">
                <input
                  type="datetime-local"
                  value={common.endAt}
                  min={common.startAt || nowDatetimeLocal()}
                  onChange={(e) => setCommonField('endAt', e.target.value)}
                  className={`${inputCls(ocrAutoFilled && !!common.endAt)} text-xs`}
                />
              </Field>
            </div>
          </div>
        )}

        {/* ── Inpock: instagram input ──────────────────────────────────── */}
        {mode === 'inpock' && inpockItems.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-4 flex flex-col gap-2">
            <p className="text-xs font-semibold text-stone-700">인스타그램 계정</p>
            {inpockInstagramUrl && !showInstagramInput ? (
              <div className="flex items-center gap-2">
                <a
                  href={inpockInstagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-orange-500 hover:underline truncate"
                >
                  {inpockInstagramUrl}
                </a>
                <button
                  type="button"
                  onClick={() => setShowInstagramInput(true)}
                  className="text-xs text-stone-400 hover:text-stone-600 flex-shrink-0"
                >
                  수정
                </button>
              </div>
            ) : (
              <Field label="이 인플루언서의 인스타그램 주소를 입력해주세요" error={instagramInputError} hint="선택사항 — 입력 안 해도 제보 가능해요">
                <input
                  type="url"
                  value={inpockInstagramUrl}
                  onChange={(e) => { setInpockInstagramUrl(e.target.value); setInstagramInputError(''); }}
                  placeholder="https://www.instagram.com/계정명"
                  className="border border-stone-200 rounded-xl px-4 py-2 w-full text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:border-orange-400 focus:ring-orange-400 transition-colors"
                />
              </Field>
            )}
          </div>
        )}

        {/* ── Submit (inpock mode) ─────────────────────────────────────── */}
        {mode === 'inpock' && inpockItems.length > 0 && (
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3.5 rounded-2xl text-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all mb-4"
          >
            {submitting && <Spinner />}
            {submitting ? '제보 중...' : '제보 완료'}
          </button>
        )}

        {/* ── Submit (srookpay / ocr mode) ─────────────────────────────── */}
        {showCommonFields && (
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3.5 rounded-2xl text-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all mb-4"
          >
            {submitting && <Spinner />}
            {submitting ? '제보 중...' : '제보 완료'}
          </button>
        )}

      </form>
      <Footer />
    </div>
  );
}