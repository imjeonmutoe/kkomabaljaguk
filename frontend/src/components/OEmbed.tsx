import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Instagram post URL — oEmbed API로만 표시, 직접 복제 절대 금지 */
  instagramUrl: string;
  /** Firestore에 저장된 oEmbed HTML (있으면 fetch 불필요) */
  cachedHtml?: string;
}

interface OEmbedResponse {
  html: string;
  author_name?: string;
  thumbnail_url?: string;
}

interface CacheEntry {
  html: string;
  ts: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간
const TOKEN = import.meta.env.VITE_OEMBED_TOKEN as string | undefined;

function cacheKey(url: string): string {
  // btoa may fail on non-Latin characters in the URL, so encode first
  return 'oe_' + btoa(encodeURIComponent(url));
}

function readCache(key: string): string | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.html;
  } catch {
    return null;
  }
}

function writeCache(key: string, html: string): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ html, ts: Date.now() } satisfies CacheEntry));
  } catch {
    // sessionStorage quota exceeded — silently ignore
  }
}

async function fetchOEmbedHtml(instagramUrl: string): Promise<string | null> {
  const key = cacheKey(instagramUrl);
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      url: instagramUrl,
      omitscript: 'true',
    });
    if (TOKEN) params.set('access_token', TOKEN);

    const res = await fetch(
      `https://graph.facebook.com/v18.0/instagram_oembed?${params.toString()}`
    );
    if (!res.ok) return null;

    const data: OEmbedResponse = await res.json();
    if (!data.html) return null;

    writeCache(key, data.html);
    return data.html;
  } catch {
    return null;
  }
}

type WindowWithInstagram = Window & {
  instgrm?: { Embeds: { process(): void } };
};

/** Instagram oEmbed 렌더러 — 직접 미디어 저장·표시 없이 oEmbed API만 사용 */
export function OEmbed({ instagramUrl, cachedHtml }: Props) {
  const [html, setHtml] = useState<string | null>(cachedHtml ?? null);
  const [loading, setLoading] = useState(!cachedHtml);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch oEmbed HTML if not provided via cachedHtml
  useEffect(() => {
    if (html) return;
    let cancelled = false;

    fetchOEmbedHtml(instagramUrl).then((result) => {
      if (cancelled) return;
      if (result) {
        setHtml(result);
      } else {
        setError(true);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [instagramUrl, html]);

  // Run Instagram's embed processor after HTML is injected into the DOM
  useEffect(() => {
    if (!html || !containerRef.current) return;
    const win = window as WindowWithInstagram;
    if (win.instgrm) {
      win.instgrm.Embeds.process();
      return;
    }
    // Load embed.js once; subsequent calls are no-ops because Instagram dedupes the script
    const script = document.createElement('script');
    script.src = 'https://www.instagram.com/embed.js';
    script.async = true;
    document.body.appendChild(script);
  }, [html]);

  // ── Skeleton ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full rounded-xl overflow-hidden bg-gray-100 animate-pulse" aria-label="로딩 중">
        {/* Mimics the aspect ratio of a square Instagram embed */}
        <div className="aspect-square w-full max-w-[400px] mx-auto">
          <div className="w-full h-full bg-gray-200" />
        </div>
        {/* Caption placeholder */}
        <div className="p-3 space-y-2">
          <div className="h-3 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  // ── Error fallback: link to original post ──────────────────────────────
  if (error) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col items-center gap-3 text-center">
        <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-xs text-gray-400">게시물을 불러올 수 없어요.</p>
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary font-semibold underline underline-offset-2 hover:text-blue-800"
        >
          원문 게시물 보기 →
        </a>
      </div>
    );
  }

  // ── Rendered oEmbed ────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      // dangerouslySetInnerHTML is intentional — HTML is from Instagram's oEmbed API only
      dangerouslySetInnerHTML={{ __html: html! }}
      className="w-full overflow-hidden rounded-xl"
    />
  );
}