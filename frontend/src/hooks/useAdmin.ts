import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns whether the currently signed-in user is an admin.
 * Used app-wide for permission checks (e.g. "전체 선택" button visibility).
 *
 * Does NOT handle redirect or login flow — use useAdminAuth for /admin page.
 */
export function useAdmin(): { isAdmin: boolean; loading: boolean } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || user.isAnonymous) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'admins', user.uid));
        setIsAdmin(snap.exists() && snap.data().isAdmin === true);
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  return { isAdmin, loading };
}