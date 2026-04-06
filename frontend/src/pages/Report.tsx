import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Footer } from '../components/Footer';
import { DEAL_CATEGORIES } from '../lib/categories';

const OCR_API_URL = (import.meta.env.VITE_OCR_SERVER_URL as string | undefined) ?? '';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB client-side limit

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = 'url' | 'ocr';

interface FormFields {
  productName: string;
  brand: string;
  category: string;
  /** datetime-local string: "YYYY-MM-DDTHH:mm" */
  startAt: string;
  /** datetime-local string: "YYYY-MM-DDTHH:mm" */
  endAt: string;
  price: string;
  instagramUrl: string;
}

type FormErrors = Partial<Record<keyof FormFields, string>>;

interface OcrResult {
  productName: string | null;
  price: number | null;
  startAt: string | null;   // "YYYY-MM-DD"
  endAt: string | null;     // "YYYY-MM-DD"
  rawLines: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormFields = {
  productName: '',
  brand: '',
  category: '',
  startAt: '',
  endAt: '',
  price: '',
  instagramUrl: '',
};

/** "YYYY-MM-DD" → "YYYY-MM-DDTHH:mm" (defaults to 00:00 so user can refine) */
function dateToDatetimeLocal(date: string): string {
  return date ? `${date}T00:00` : '';
}

/** Produce the current datetime string rounded down to the minute */
function nowDatetimeLocal(): string {
  return new Date().toISOString().slice(0, 16);
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
      <label className="text-xs font-semibold text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-gray-400">{hint}</p>}
      {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────

function SuccessScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-center max-w-xs">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-base font-bold text-gray-900 mb-2">제보가 접수됐어요!</h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          검토 후 24시간 내 게시됩니다.<br />승인되면 타임라인에 나타나요.
        </p>
        <button
          onClick={onBack}
          className="bg-primary text-white font-semibold py-3 px-8 rounded-xl text-sm
            hover:bg-blue-800 active:scale-[0.98] transition-all"
        >
          타임라인으로
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** 공구 제보 페이지 — URL 입력 모드 / 이미지 OCR 모드 */
export function Report() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('url');
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // OCR mode state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrLines, setOcrLines] = useState<string[]>([]);
  const [ocrAutoFilled, setOcrAutoFilled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URL on unmount / image change
  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview); };
  }, [imagePreview]);

  // ── Field helpers ───────────────────────────────────────────────────────
  function set<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  // ── Validation ──────────────────────────────────────────────────────────
  function validate(): boolean {
    const next: FormErrors = {};

    if (form.productName.trim().length < 2) {
      next.productName = '상품명을 2자 이상 입력해 주세요.';
    }
    if (!form.category) {
      next.category = '카테고리를 선택해 주세요.';
    }
    if (!form.startAt) {
      next.startAt = '시작 일시를 입력해 주세요.';
    } else if (new Date(form.startAt) <= new Date()) {
      next.startAt = '시작 일시는 현재 시각 이후여야 해요.';
    }
    if (form.endAt && form.startAt && form.endAt < form.startAt) {
      next.endAt = '종료 일시는 시작 일시 이후여야 해요.';
    }
    if (tab === 'url') {
      if (!form.instagramUrl.trim()) {
        next.instagramUrl = '인스타그램 URL을 입력해 주세요.';
      } else if (!form.instagramUrl.includes('instagram.com')) {
        next.instagramUrl = '올바른 인스타그램 URL이 아니에요.';
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ── Image selection ─────────────────────────────────────────────────────
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
  }

  // ── OCR extraction ──────────────────────────────────────────────────────
  async function handleOcrExtract() {
    if (!imageFile || ocrLoading) return;
    if (!OCR_API_URL) {
      setOcrError('OCR 서버 URL이 설정되지 않았어요. (.env VITE_OCR_SERVER_URL)');
      return;
    }

    setOcrLoading(true);
    setOcrError(null);
    setOcrAutoFilled(false);

    try {
      const formData = new FormData();
      formData.append('file', imageFile);

      const res = await fetch(`${OCR_API_URL}/ocr`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(detail.detail ?? `서버 오류 (${res.status})`);
      }

      const data: OcrResult = await res.json();

      // Auto-fill form fields — only overwrite if OCR returned a value
      setForm((prev) => ({
        ...prev,
        productName: data.productName ?? prev.productName,
        price: data.price != null ? String(data.price) : prev.price,
        startAt: data.startAt ? dateToDatetimeLocal(data.startAt) : prev.startAt,
        endAt: data.endAt ? dateToDatetimeLocal(data.endAt) : prev.endAt,
      }));

      setOcrLines(data.rawLines ?? []);
      setOcrAutoFilled(true);
      // Clear errors for newly filled fields
      setErrors({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OCR 처리 중 오류가 발생했어요.';
      setOcrError(msg);
    } finally {
      setOcrLoading(false);
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const userId = auth.currentUser?.uid ?? '';
      await addDoc(collection(db, 'deals'), {
        productName: form.productName.trim(),
        brand: form.brand.trim(),
        category: form.category,
        startAt: new Date(form.startAt),
        endAt: form.endAt ? new Date(form.endAt) : new Date(form.startAt),
        price: form.price ? parseInt(form.price, 10) : 0,
        instagramUrl: form.instagramUrl.trim(),
        oembedHtml: '',
        naverProducts: [],
        naverUpdatedAt: null,
        status: 'pending',   // 관리자 승인 전 비공개
        reporterId: userId,
        createdAt: serverTimestamp(),
        viewCount: 0,
      });
      setSuccess(true);
    } catch (err) {
      console.error('[Report] submit error:', err);
      setErrors({ productName: '제출 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render: success ─────────────────────────────────────────────────────
  if (success) return <SuccessScreen onBack={() => navigate('/')} />;

  // ── Render: form ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-10">

      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="뒤로 가기"
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-sm font-bold text-gray-900">공구 제보하기</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} noValidate className="max-w-lg mx-auto px-4 pt-4 flex flex-col gap-5">

        {/* ── Mode tabs ───────────────────────────────────────────────── */}
        <div className="bg-gray-100 p-1 rounded-xl flex gap-1">
          <TabButton active={tab === 'url'} onClick={() => setTab('url')}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            URL 입력
          </TabButton>
          <TabButton active={tab === 'ocr'} onClick={() => setTab('ocr')}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            이미지 OCR
          </TabButton>
        </div>

        {/* ── URL mode: Instagram URL field ───────────────────────────── */}
        {tab === 'url' && (
          <Field label="인스타그램 게시물 URL" required error={errors.instagramUrl}
            hint="공구 게시물의 인스타그램 URL을 붙여넣으세요.">
            <input
              type="url"
              value={form.instagramUrl}
              onChange={(e) => set('instagramUrl', e.target.value)}
              placeholder="https://www.instagram.com/p/..."
              autoComplete="off"
              className="input-base"
            />
          </Field>
        )}

        {/* ── OCR mode: image upload + extraction ─────────────────────── */}
        {tab === 'ocr' && (
          <div className="flex flex-col gap-3">
            {/* Drop zone / file picker */}
            <div
              role="button"
              tabIndex={0}
              aria-label="이미지 선택"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              className={`
                relative flex flex-col items-center justify-center
                border-2 border-dashed rounded-2xl
                cursor-pointer transition-colors duration-150
                ${imagePreview
                  ? 'border-primary/30 bg-blue-50/30 p-2'
                  : 'border-gray-200 bg-white hover:border-primary/50 hover:bg-blue-50/20 p-8'}
              `}
            >
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="선택된 이미지"
                  className="w-full max-h-64 object-contain rounded-xl"
                />
              ) : (
                <>
                  <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-500">공구 이미지를 선택하세요</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · 최대 5MB</p>
                </>
              )}
              {imagePreview && (
                <p className="text-xs text-gray-400 mt-2">{imageFile?.name}</p>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageChange}
            />

            {/* AI 자동 추출 button */}
            <button
              type="button"
              onClick={handleOcrExtract}
              disabled={!imageFile || ocrLoading}
              className="
                w-full flex items-center justify-center gap-2
                bg-primary text-white font-semibold
                py-3 rounded-xl text-sm
                hover:bg-blue-800 active:scale-[0.98]
                transition-all duration-150
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {ocrLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  AI 분석 중...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI 자동 추출
                </>
              )}
            </button>

            {/* OCR error */}
            {ocrError && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-xs text-red-600">
                {ocrError}
              </div>
            )}

            {/* Auto-fill result */}
            {ocrAutoFilled && ocrLines.length > 0 && (
              <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-700 mb-2">
                  ✓ 자동 추출 완료 — 아래 필드를 확인하고 수정하세요
                </p>
                <details className="group">
                  <summary className="text-[11px] text-green-600 cursor-pointer select-none
                    group-open:mb-2">
                    추출된 텍스트 {ocrLines.length}줄 보기
                  </summary>
                  <div className="bg-white/60 rounded-lg p-2 max-h-28 overflow-y-auto">
                    {ocrLines.map((line, i) => (
                      <p key={i} className="text-[11px] text-gray-600 leading-relaxed">{line}</p>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}

        {/* ── Shared form fields ───────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Product name */}
          <Field label="상품명" required error={errors.productName}>
            <input
              type="text"
              value={form.productName}
              onChange={(e) => set('productName', e.target.value)}
              placeholder="예) 유기농 쌀과자"
              className={`input-base ${ocrAutoFilled && form.productName ? 'border-primary/40 bg-blue-50/30' : ''}`}
            />
          </Field>

          {/* Brand */}
          <Field label="브랜드 / 인플루언서">
            <input
              type="text"
              value={form.brand}
              onChange={(e) => set('brand', e.target.value)}
              placeholder="예) @baby_influencer"
              className="input-base"
            />
          </Field>

          {/* Category */}
          <Field label="카테고리" required error={errors.category}>
            <select
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              className="input-base bg-white"
            >
              <option value="">선택해 주세요</option>
              {DEAL_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>

          {/* Start / End datetime */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="시작 일시" required error={errors.startAt}>
              <input
                type="datetime-local"
                value={form.startAt}
                min={nowDatetimeLocal()}
                onChange={(e) => set('startAt', e.target.value)}
                className={`input-base text-xs ${ocrAutoFilled && form.startAt ? 'border-primary/40 bg-blue-50/30' : ''}`}
              />
            </Field>
            <Field label="종료 일시" error={errors.endAt}
              hint="미정이면 비워두세요">
              <input
                type="datetime-local"
                value={form.endAt}
                min={form.startAt || nowDatetimeLocal()}
                onChange={(e) => set('endAt', e.target.value)}
                className={`input-base text-xs ${ocrAutoFilled && form.endAt ? 'border-primary/40 bg-blue-50/30' : ''}`}
              />
            </Field>
          </div>

          {/* Price */}
          <Field label="가격 (원)" hint="미정이면 비워두세요">
            <div className="relative">
              <input
                type="number"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                placeholder="0"
                min="0"
                step="100"
                className={`input-base pr-6 ${ocrAutoFilled && form.price ? 'border-primary/40 bg-blue-50/30' : ''}`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                원
              </span>
            </div>
          </Field>

          {/* Instagram URL (optional in OCR mode) */}
          {tab === 'ocr' && (
            <Field label="인스타그램 게시물 URL" hint="알고 있다면 입력해 주세요 (선택)">
              <input
                type="url"
                value={form.instagramUrl}
                onChange={(e) => set('instagramUrl', e.target.value)}
                placeholder="https://www.instagram.com/p/..."
                className="input-base"
              />
            </Field>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="
            w-full flex items-center justify-center gap-2
            bg-primary text-white font-semibold
            py-3.5 rounded-2xl text-sm
            hover:bg-blue-800 active:scale-[0.98]
            transition-all duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
            mb-4
          "
        >
          {submitting && (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {submitting ? '제보 중...' : '제보 완료'}
        </button>

      </form>
      <Footer />
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-1 flex items-center justify-center gap-1.5
        py-2 rounded-lg text-xs font-semibold
        transition-all duration-150
        ${active
          ? 'bg-white text-primary shadow-sm'
          : 'text-gray-400 hover:text-gray-600'}
      `}
    >
      {children}
    </button>
  );
}