import { useState, useEffect, useCallback } from 'react';
import {
  signInWithRedirect,
  getRedirectResult,
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

// ── Module-level: process redirect result only once (React StrictMode safe) ──

let _redirectChecked = false;

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

    // Process redirect result once per app lifecycle
    if (!_redirectChecked) {
      _redirectChecked = true;
      getRedirectResult(auth)
        .then(async (result) => {
          if (!result) return;
          const isAdmin = await fetchIsAdmin(result.user.uid);
          setStatus(isAdmin ? 'admin' : 'denied');
        })
        .catch((err) => {
          console.error('[useAdminAuth] getRedirectResult error:', err.code, err);
          // Do not override status if onAuthStateChanged already resolved auth
          setStatus((prev) => {
            if (prev === 'admin' || prev === 'denied') return prev;
            return 'unauthenticated';
          });
        });
    }

    // Watch auth state for already-signed-in Google users (page refresh etc.)
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || user.isAnonymous) {
        setStatus((prev) => (prev === 'loading' ? 'unauthenticated' : prev));
        return;
      }
      setStatus((prev) => {
        if (prev === 'admin' || prev === 'denied') return prev;
        return 'checking';
      });
      const isAdmin = await fetchIsAdmin(user.uid);
      setStatus(isAdmin ? 'admin' : 'denied');
    });

    return unsub;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error('[useAdminAuth] signInWithRedirect error:', err);
      setError('Google 로그인을 시작할 수 없어요. 다시 시도해 주세요.');
      setStatus('unauthenticated');
    }
  }, []);

  const signOut = useCallback(async () => {
    _redirectChecked = false;
    await firebaseSignOut(auth);
  }, []);

  return { status, error, signInWithGoogle, signOut };
}