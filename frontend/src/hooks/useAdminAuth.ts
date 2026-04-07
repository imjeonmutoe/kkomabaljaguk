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

    console.log('[useAdminAuth] init — authDomain:', auth.config.authDomain);
    console.log('[useAdminAuth] _redirectChecked:', _redirectChecked);
    console.log('[useAdminAuth] location.href:', window.location.href);
    console.log('[useAdminAuth] location.search:', window.location.search);

    // Process redirect result once per app lifecycle
    if (!_redirectChecked) {
      _redirectChecked = true;
      console.log('[useAdminAuth] calling getRedirectResult...');

      getRedirectResult(auth)
        .then(async (result) => {
          console.log('[useAdminAuth] getRedirectResult resolved:', result);
          if (!result) {
            console.log('[useAdminAuth] no redirect result — user may not have come from redirect');
            return;
          }
          console.log('[useAdminAuth] redirect result uid:', result.user.uid);
          console.log('[useAdminAuth] redirect result provider:', result.providerId);
          const isAdmin = await fetchIsAdmin(result.user.uid);
          console.log('[useAdminAuth] isAdmin:', isAdmin);
          setStatus(isAdmin ? 'admin' : 'denied');
        })
        .catch((err) => {
          console.error('[useAdminAuth] getRedirectResult ERROR:', err);
          console.error('[useAdminAuth] error code:', err.code);
          console.error('[useAdminAuth] error message:', err.message);
          setError('Google 로그인에 실패했어요. 다시 시도해 주세요.');
          setStatus('unauthenticated');
        });
    }

    // Watch auth state for already-signed-in Google users (page refresh etc.)
    const unsub = onAuthStateChanged(auth, async (user) => {
      console.log('[useAdminAuth] onAuthStateChanged fired');
      console.log('[useAdminAuth]   uid:', user?.uid ?? 'null');
      console.log('[useAdminAuth]   isAnonymous:', user?.isAnonymous ?? 'null');
      console.log('[useAdminAuth]   providerData:', JSON.stringify(user?.providerData ?? []));
      console.log('[useAdminAuth]   currentStatus:', status);

      if (!user || user.isAnonymous) {
        console.log('[useAdminAuth] → unauthenticated (no user or anonymous)');
        setStatus((prev) => (prev === 'loading' ? 'unauthenticated' : prev));
        return;
      }

      console.log('[useAdminAuth] → Google user detected, checking admin...');
      setStatus((prev) => {
        if (prev === 'admin' || prev === 'denied') return prev;
        return 'checking';
      });
      const isAdmin = await fetchIsAdmin(user.uid);
      console.log('[useAdminAuth] fetchIsAdmin result:', isAdmin, 'uid:', user.uid);
      setStatus(isAdmin ? 'admin' : 'denied');
    });

    return unsub;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    console.log('[useAdminAuth] signInWithGoogle called');
    console.log('[useAdminAuth] auth.currentUser before redirect:', auth.currentUser?.uid ?? 'null');
    try {
      console.log('[useAdminAuth] calling signInWithRedirect...');
      await signInWithRedirect(auth, googleProvider);
      // Page navigates to Google — nothing after this runs
      console.log('[useAdminAuth] signInWithRedirect returned (should not reach here)');
    } catch (err) {
      console.error('[useAdminAuth] signInWithRedirect FAILED:', err);
      setError('Google 로그인을 시작할 수 없어요. 다시 시도해 주세요.');
      setStatus('unauthenticated');
    }
  }, []);

  const signOut = useCallback(async () => {
    console.log('[useAdminAuth] signOut');
    _redirectChecked = false;
    await firebaseSignOut(auth);
  }, []);

  return { status, error, signInWithGoogle, signOut };
}