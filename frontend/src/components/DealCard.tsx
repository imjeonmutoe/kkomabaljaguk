import { memo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Users, Heart, Bell, BellOff } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { cn } from '../lib/utils';
import { getCategoryDef } from '../lib/categories';
import type { Deal } from '../types';
import type { Timestamp } from 'firebase/firestore';

interface Props {
  deal: Deal;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return price > 0 ? `${price.toLocaleString('ko-KR')}원` : '가격 미정';
}

type DealPhase = 'ended' | 'active' | 'soon' | 'upcoming';

function toMs(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === 'string') return new Date(v).getTime();
  if (typeof (v as { toMillis?: unknown }).toMillis === 'function')
    return (v as { toMillis: () => number }).toMillis();
  return null;
}

function getPhase(deal: Deal): DealPhase {
  const now = Date.now();
  const startMs = toMs(deal.startAt);
  const endMs = toMs(deal.endAt);
  if (endMs != null && endMs < now) return 'ended';
  if (startMs == null || endMs == null) return 'active';
  if (startMs <= now) return 'active';
  if (startMs - now < 24 * 60 * 60 * 1000) return 'soon';
  return 'upcoming';
}

function timeRemaining(endAt: Timestamp): string | null {
  const endMs = toMs(endAt);
  if (endMs == null) return null;
  const ms = endMs - Date.now();
  if (ms <= 0) return null;
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function getDiscountRate(deal: Deal): { rate: number; originalPrice: number } | null {
  if (!deal.naverProducts?.length || !deal.price) return null;
  const original = parseInt(deal.naverProducts[0].lprice, 10);
  if (!original || deal.price >= original) return null;
  return { rate: Math.round((1 - deal.price / original) * 100), originalPrice: original };
}

// ── Category badge ────────────────────────────────────────────────────────────

function CategoryBadge({ cat }: { cat: string }) {
  const { Icon, color } = getCategoryDef(cat);
  return (
    <Badge variant="outline" className={cn('flex items-center gap-1 text-xs', color)}>
      <Icon className="w-3 h-3" />
      {cat}
    </Badge>
  );
}

// ── Alarm localStorage ────────────────────────────────────────────────────────

function getAlarmedIds(): Set<string> {
  try {
    const raw = localStorage.getItem('alarmedDeals');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function toggleAlarmedId(dealId: string): boolean {
  const set = getAlarmedIds();
  set.has(dealId) ? set.delete(dealId) : set.add(dealId);
  localStorage.setItem('alarmedDeals', JSON.stringify([...set]));
  return set.has(dealId);
}

// ── Component ────────────────────────────────────────────────────────────────

export const DealCard = memo(function DealCard({ deal }: Props) {
  const navigate = useNavigate();
  const phase = getPhase(deal);
  const discount = getDiscountRate(deal);
  const remaining = timeRemaining(deal.endAt);
  const isHot = deal.viewCount >= 50 || (phase === 'active' && deal.viewCount >= 20);
  const image = deal.naverProducts?.[0]?.image ?? null;

  const [alarmed, setAlarmed] = useState(() => getAlarmedIds().has(deal.id));
  const [wishlisted, setWishlisted] = useState(false);

  const handleAlarm = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setAlarmed(toggleAlarmedId(deal.id));
  }, [deal.id]);

  const handleWishlist = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setWishlisted((v) => !v);
  }, []);

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`${deal.productName} 상세 보기`}
      onClick={() => navigate(`/deal/${deal.id}`)}
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && navigate(`/deal/${deal.id}`)}
      className="mb-0 overflow-hidden hover:shadow-lg active:scale-[0.99] transition-all duration-150 cursor-pointer"
    >
      <div className="flex">
        {/* ── Image ───────────────────────────────────────────────────────── */}
        <div className="relative w-28 h-28 sm:w-36 sm:h-36 flex-shrink-0">
          {image ? (
            <img
              src={image}
              alt={deal.productName}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-secondary flex items-center justify-center">
              <svg className="w-10 h-10 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          {isHot && (
            <Badge className="absolute top-2 left-2 bg-destructive text-destructive-foreground text-xs">
              HOT
            </Badge>
          )}
          {phase === 'active' && remaining && (
            <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs">
              마감임박
            </Badge>
          )}
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between min-w-0">
          <div>
            {/* Category + wishlist */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <CategoryBadge cat={deal.category} />
              <button
                onClick={handleWishlist}
                className="text-muted-foreground hover:text-destructive transition-colors p-0.5 -mt-0.5 -mr-0.5"
                aria-label={wishlisted ? '관심 해제' : '관심 등록'}
              >
                <Heart
                  className={cn('w-5 h-5', wishlisted && 'fill-destructive text-destructive')}
                />
              </button>
            </div>

            {/* Brand */}
            {deal.brand && (
              <p className="text-xs text-muted-foreground mb-0.5 truncate">{deal.brand}</p>
            )}

            {/* Product name */}
            <h2 className="font-semibold text-sm sm:text-base text-foreground line-clamp-2 leading-snug">
              {deal.productName}
            </h2>
          </div>

          <div className="mt-2">
            {/* Price row */}
            <div className="flex items-baseline gap-2 mb-2">
              {discount && (
                <span className="text-destructive font-bold text-lg">{discount.rate}%</span>
              )}
              <span className="font-bold text-foreground">
                {formatPrice(deal.price)}
              </span>
              {discount && (
                <span className="text-xs text-muted-foreground line-through">
                  {discount.originalPrice.toLocaleString('ko-KR')}원
                </span>
              )}
            </div>

            {/* Stats + alarm */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {deal.viewCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {deal.viewCount.toLocaleString('ko-KR')}명
                  </span>
                )}
                {remaining && phase !== 'ended' && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {remaining}
                  </span>
                )}
                {phase === 'ended' && (
                  <span className="text-muted-foreground/50">종료됨</span>
                )}
              </div>

              {phase !== 'ended' && (
                <Button
                  variant={alarmed ? 'secondary' : 'default'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleAlarm}
                >
                  {alarmed ? (
                    <>
                      <BellOff className="w-3.5 h-3.5 mr-1" />
                      알림 해제
                    </>
                  ) : (
                    <>
                      <Bell className="w-3.5 h-3.5 mr-1" />
                      알림
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
});