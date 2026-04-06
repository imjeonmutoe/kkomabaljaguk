import { useCallback } from 'react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Lightweight Firestore-backed analytics.
 * All functions are fire-and-forget — callers never need to await them.
 * Errors are silently swallowed so analytics never breaks the UI.
 *
 * Collections written to:
 *   analytics/{id}  — pageViews, adClicks, naverClicks
 *   deals/{dealId}  — viewCount increments
 */
export function useAnalytics() {

  /**
   * Log a page view.
   * Call once per page component mount (e.g. in a useEffect with no deps).
   */
  const trackPageView = useCallback((page: string): void => {
    addDoc(collection(db, 'analytics'), {
      type: 'pageView',
      page,
      timestamp: serverTimestamp(),
    }).catch(() => {/* ignore */});
  }, []);

  /**
   * Log an ad unit impression or click.
   * @param adType  'adsense' | 'adfit' | 'naver'
   * @param slot    Ad slot ID or unit name
   */
  const trackAdClick = useCallback((adType: 'adsense' | 'adfit' | 'naver', slot: string): void => {
    addDoc(collection(db, 'analytics'), {
      type: 'adClick',
      adType,
      slot,
      timestamp: serverTimestamp(),
    }).catch(() => {/* ignore */});
  }, []);

  /**
   * Increment a deal's viewCount.
   * Already called by DealDetail on mount via incrementViewCount() from useDeals —
   * use this hook version when you need a consistent analytics call site.
   */
  const trackDealView = useCallback((dealId: string): void => {
    updateDoc(doc(db, 'deals', dealId), {
      viewCount: increment(1),
    }).catch(() => {/* ignore */});
  }, []);

  /**
   * Log a Naver Shopping product card click.
   * Stored in analytics for A/B testing which products convert best.
   *
   * @param dealId        The deal whose NaverProducts section was clicked
   * @param productIndex  0-based index of the clicked card in the displayed list
   */
  const trackNaverClick = useCallback((dealId: string, productIndex: number): void => {
    addDoc(collection(db, 'analytics'), {
      type: 'naverClick',
      dealId,
      productIndex,
      clickedAt: serverTimestamp(),
    }).catch(() => {/* ignore */});
  }, []);

  return { trackPageView, trackAdClick, trackDealView, trackNaverClick };
}