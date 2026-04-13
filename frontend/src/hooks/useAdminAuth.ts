import { useState, useEffect, useCallback } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminStatus =
  | 'loading'
  | 'unauthenticated'
  | 'checking'
  | 'admin'
  | 'denied';

export interface UseAdminAuthResult {
  status: AdminStatus;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchIsAdmin(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'admins', uid));
  return snap.exists() && snap.data().isAdmin === true;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAdminAuth(): UseAdminAuthResult {
  const [status, setStatus] = useState<AdminStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Dev bypass
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN === 'true') {
      setStatus('admin');
      return;
    }

    // Watch auth state for already-signed-in Google users (page refresh etc.)
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || user.isAnonymous) {
        setStatus('unauthenticated');
        return;
      }
      console.log('[useAdminAuth] current user uid:', user.uid);
      setStatus('checking');
      const isAdmin = await fetchIsAdmin(user.uid);
      setStatus(isAdmin ? 'admin' : 'denied');
    });

    return unsub;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log('[useAdminAuth] popup sign-in uid:', result.user.uid);
      const isAdmin = await fetchIsAdmin(result.user.uid);
      setStatus(isAdmin ? 'admin' : 'denied');
    } catch (err) {
      console.error('[useAdminAuth] signInWithPopup error:', err);
      setError('Google 로그인에 실패했어요. 다시 시도해 주세요.');
      setStatus('unauthenticated');
    }
  }, []);

  const signOut = useCallback(async () => {
    setStatus('loading');
    await firebaseSignOut(auth);
  }, []);

  return { status, error, signInWithGoogle, signOut };
}