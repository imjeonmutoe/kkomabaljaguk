import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  increment,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Deal } from '../types';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5-minute polling — avoids costly onSnapshot

export interface UseDealsOptions {
  /** Filter by category (undefined = all categories) */
  category?: string;
  /** Only return deals whose startAt >= dateFrom */
  dateFrom?: Date;
  /** Only return deals whose startAt <= dateTo */
  dateTo?: Date;
}

export interface UseDealsResult {
  deals: Deal[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDeals(options: UseDealsOptions = {}): UseDealsResult {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use primitive deps so useCallback re-creates (and re-polls) when filters actually change.
  // Date objects are reduced to ms timestamps to stay referentially stable.
  const { category } = options;
  const dateFromMs = options.dateFrom?.getTime() ?? null;
  const dateToMs = options.dateTo?.getTime() ?? null;

  const fetchDeals = useCallback(async () => {
    try {
      const constraints: QueryConstraint[] = [
        where('status', '==', 'approved'),
        orderBy('startAt', 'asc'),
      ];

      // Uses composite index (status, category, startAt)
      if (category) {
        constraints.push(where('category', '==', category));
      }

      // Firestore requires the inequality field to match the orderBy field
      if (dateFromMs !== null) {
        constraints.push(where('startAt', '>=', Timestamp.fromMillis(dateFromMs)));
      }
      if (dateToMs !== null) {
        constraints.push(where('startAt', '<=', Timestamp.fromMillis(dateToMs)));
      }

      const q = query(collection(db, 'deals'), ...constraints);
      const snapshot = await getDocs(q);
      const fetched: Deal[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Deal, 'id'>),
      }));

      setDeals(fetched);
      setError(null);
    } catch (err) {
      setError('딜 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      console.error('[useDeals] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [category, dateFromMs, dateToMs]); // re-creates when filters change → restarts interval

  useEffect(() => {
    setLoading(true);
    fetchDeals();
    const interval = setInterval(fetchDeals, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDeals]);

  return { deals, loading, error, refetch: fetchDeals };
}

// ── Utilities ──────────────────────────────────────────────────────────────

/** Fetch a single deal by ID. Returns null if not found. */
export async function getDealById(id: string): Promise<Deal | null> {
  try {
    const snap = await getDoc(doc(db, 'deals', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<Deal, 'id'>) };
  } catch {
    return null;
  }
}

/** Increment a deal's viewCount — fire-and-forget */
export function incrementViewCount(dealId: string): void {
  updateDoc(doc(db, 'deals', dealId), { viewCount: increment(1) }).catch(
    (err) => console.error('[useDeals] viewCount error:', err)
  );
}