import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, BellOff, Flame, ArrowUpDown, Clock } from 'lucide-react';
import { CATEGORIES } from '../lib/categories';
import { DealCard } from '../components/DealCard';
import { AdSenseUnit } from '../components/AdSenseUnit';
import { PushConsent } from '../components/PushConsent';
import { BottomNav } from '../components/BottomNav';
import { Button } from '../components/ui/button';
import { ScrollArea, ScrollBar } from '../components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { cn } from '../lib/utils';
import { useDeals } from '../hooks/useDeals';
import { useFCM } from '../hooks/useFCM';
import type { Deal } from '../types';

const ADSENSE_SLOT = import.meta.env.VITE_ADSENSE_SLOT_TIMELINE as string;
const PAGE_SIZE = 10;

// ── Categories ────────────────────────────────────────────────────────────────

type CategoryId = (typeof CATEGORIES)[number]['id'];

// ── Sort ──────────────────────────────────────────────────────────────────────

type SortType = '최신순' | '인기순' | '마감임박';

const SORT_OPTIONS: { value: SortType; label: string; Icon: React.ElementType }[] = [
  { value: '최신순',  label: '최신순',  Icon: ArrowUpDown },
  { value: '인기순',  label: '인기순',  Icon: Flame },
  { value: '마감임박', label: '마감임박', Icon: Clock },
];

function sortDeals(deals: Deal[], sort: SortType): Deal[] {
  const now = Date.now();
  switch (sort) {
    case '최신순':
      return [...deals].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    case '인기순':
      return [...deals].sort((a, b) => b.viewCount - a.viewCount);
    case '마감임박':
      return [...deals]
        .filter((d) => d.endAt.toDate().getTime() > now)
        .sort((a, b) => a.endAt.toMillis() - b.endAt.toMillis());
  }
}

function isDealActive(deal: Deal): boolean {
  const now = Date.now();
  return deal.startAt.toDate().getTime() <= now && deal.endAt.toDate().getTime() > now;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-card rounded-2xl border border-border p-3 animate-pulse flex gap-3">
      <div className="w-28 h-28 flex-shrink-0 bg-secondary rounded-xl" />
      <div className="flex-1 flex flex-col gap-2 pt-1">
        <div className="h-4 w-14 bg-secondary rounded-full" />
        <div className="h-3 w-20 bg-muted rounded" />
        <div className="h-4 w-3/4 bg-secondary rounded" />
        <div className="flex items-center gap-2 mt-auto">
          <div className="h-4 w-16 bg-secondary rounded" />
          <div className="h-6 w-14 bg-muted rounded-full ml-auto" />
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const ADMIN_HOLD_MS = 3000;

export function Timeline() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<CategoryId>('전체');
  const [sort, setSort] = useState<SortType>('최신순');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holdProgress, setHoldProgress] = useState(0); // 0~100

  const startHold = useCallback(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / ADMIN_HOLD_MS) * 100, 100);
      setHoldProgress(pct);
      if (pct < 100) {
        holdTimerRef.current = setTimeout(tick, 30);
      } else {
        navigate('/admin');
        setHoldProgress(0);
      }
    };
    holdTimerRef.current = setTimeout(tick, 30);
  }, [navigate]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    setHoldProgress(0);
  }, []);

  const { deals, loading, error } = useDeals({
    category: category === '전체' ? undefined : category,
  });
  const { hasConsent, saveToken } = useFCM();

  const activeCount = useMemo(() => deals.filter(isDealActive).length, [deals]);

  const filtered = useMemo(() => {
    let result = deals;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (d) => d.productName.toLowerCase().includes(q) || d.brand?.toLowerCase().includes(q)
      );
    }
    return sortDeals(result, sort);
  }, [deals, search, sort]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [category, search, sort]);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [searchOpen]);

  const hasMore = visibleCount < filtered.length;
  const loadMore = useCallback(
    () => setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length)),
    [filtered.length]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="min-h-screen bg-background pb-24">

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STICKY HEADER                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
        <div className="max-w-lg mx-auto px-4">

          {/* App bar */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              {/* Long-press 3s → /admin (hidden trigger) */}
              <div
                className="relative w-9 h-9 flex-shrink-0 select-none cursor-default"
                onMouseDown={startHold}
                onMouseUp={cancelHold}
                onMouseLeave={cancelHold}
                onTouchStart={startHold}
                onTouchEnd={cancelHold}
                onContextMenu={(e) => e.preventDefault()}
              >
                {/* Progress ring — only visible while holding */}
                {holdProgress > 0 && (
                  <svg className="absolute inset-0 w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18" cy="18" r="16"
                      fill="none"
                      stroke="white"
                      strokeOpacity="0.6"
                      strokeWidth="2.5"
                      strokeDasharray={`${holdProgress} 100`}
                      strokeLinecap="round"
                      pathLength="100"
                    />
                  </svg>
                )}
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-sm">
                  <span className="text-primary-foreground font-extrabold text-sm leading-none">꼬</span>
                </div>
              </div>
              <span className="font-extrabold text-lg text-foreground tracking-tight">꼬마발자국</span>
            </div>

            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                aria-label="검색"
                onClick={() => setSearchOpen((v) => !v)}
                className={cn(searchOpen && 'text-primary')}
              >
                <Search className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={hasConsent ? '알림 설정됨' : '알림 받기'}
                onClick={() => { if (!hasConsent) saveToken(); }}
                className="relative"
              >
                {hasConsent ? (
                  <Bell className="w-5 h-5 text-primary" />
                ) : (
                  <BellOff className="w-5 h-5" />
                )}
                {!hasConsent && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-destructive rounded-full" />
                )}
              </Button>
            </div>
          </div>

          {/* Search bar */}
          {searchOpen && (
            <div className="pb-2">
              <div className="flex items-center gap-2 bg-card rounded-2xl px-3 py-2 border border-border shadow-sm">
                <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="상품명, 브랜드 검색"
                  className="flex-1 text-sm text-foreground bg-transparent outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground text-xs font-bold">✕</button>
                )}
                <button
                  onClick={() => { setSearchOpen(false); setSearch(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground font-medium ml-1 pl-2 border-l border-border"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* Title + count */}
          <div className="flex items-start justify-between py-2">
            <div>
              <h1 className="text-xl font-bold text-foreground">공구 타임라인</h1>
              <p className="text-sm text-muted-foreground">오늘의 핫한 공동구매를 확인하세요</p>
            </div>
            {activeCount > 0 && (
              <div className="flex items-center gap-1 text-sm text-primary font-medium mt-1">
                <Flame className="w-4 h-4" />
                <span>진행 중 {activeCount}건</span>
              </div>
            )}
          </div>

          {/* Category filter */}
          <div className="pb-2">
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-2 pb-3">
                {CATEGORIES.map(({ id, label, Icon }) => (
                  <Button
                    key={id}
                    variant={category === id ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      'flex-shrink-0 gap-1.5 rounded-full',
                      category === id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card text-foreground hover:bg-secondary'
                    )}
                    onClick={() => setCategory(id)}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Button>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="invisible" />
            </ScrollArea>
          </div>

          {/* Sort tabs */}
          <div className="pb-3">
            <Tabs value={sort} onValueChange={(v) => setSort(v as SortType)}>
              <TabsList className="grid w-full grid-cols-3">
                {SORT_OPTIONS.map(({ value, label, Icon }) => (
                  <TabsTrigger key={value} value={value} className="text-sm gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* FEED                                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <main className="max-w-lg mx-auto px-4 py-4">

        {loading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {!loading && error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl p-4 text-center">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center py-20 gap-3">
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {search ? `'${search}' 검색 결과가 없어요`
                : category !== '전체' ? '이 카테고리엔 공구가 없어요'
                : sort === '마감임박' ? '진행 중인 공구가 없어요'
                : '등록된 공구가 없어요'}
            </p>
            {(search || category !== '전체') && (
              <button
                onClick={() => { setSearch(''); setCategory('전체'); }}
                className="text-xs text-primary underline underline-offset-2"
              >
                필터 초기화
              </button>
            )}
          </div>
        )}

        {/* Deal list with timeline dots */}
        {!loading && !error && visible.length > 0 && (
          <div className="relative">
            {visible.map((deal, idx) => {
              const active = isDealActive(deal);
              const isLast = idx === visible.length - 1 && !hasMore;
              return (
                <div key={deal.id}>
                  <div className="relative flex gap-4">
                    {/* Timeline column */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={cn(
                        'w-3 h-3 rounded-full border-2 border-primary bg-background z-10 mt-5',
                        active && 'bg-primary'
                      )} />
                      {!isLast && (
                        <div className="w-0.5 flex-1 bg-border min-h-[120px]" />
                      )}
                    </div>

                    {/* Card */}
                    <div className="flex-1 mb-4 min-w-0">
                      <DealCard deal={deal} />
                    </div>
                  </div>

                  {/* AdSense after every 3rd card */}
                  {(idx + 1) % 3 === 0 && (
                    <AdSenseUnit
                      slot={ADSENSE_SLOT}
                      format="auto"
                      className="mb-4 rounded-2xl overflow-hidden min-h-[50px]"
                    />
                  )}
                </div>
              );
            })}

            {hasMore && (
              <div ref={sentinelRef} className="flex flex-col gap-3">
                <SkeletonCard />
              </div>
            )}

            {!hasMore && filtered.length > PAGE_SIZE && (
              <p className="text-center text-xs text-muted-foreground/40 py-4">
                — 공구 목록 끝 —
              </p>
            )}
          </div>
        )}
      </main>

      {/* 제보 FAB */}
      <button
        onClick={() => navigate('/report')}
        aria-label="공구 제보하기"
        className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <PushConsent />
      <BottomNav />
    </div>
  );
}