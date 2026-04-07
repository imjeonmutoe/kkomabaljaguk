import { useState, useEffect, useCallback } from 'react';
import {
  linkWithRedirect,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type AuthError,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminStatus =
  | 'loading'          // auth state not yet resolved
  | 'unauthenticated'  // no Google sign-in yet (or anonymous only)
  | 'checking'         // signed in with Google, checking admins collection
  | 'admin'            // confirmed admin
  | 'denied';          // Google account not in admins collection

export interface UseAdminAuthResult {
  status: AdminStatus;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function fetchIsAdmin(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'admins', uid));
  return snap.exists() && snap.data().isAdmin === true;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAdminAuth(): UseAdminAuthResult {
  const [status, setStatus] = useState<AdminStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Process any pending redirect result from Google (no-op if none)
    getRedirectResult(auth).catch((err: AuthError) => {
      if (err.code !== 'auth/no-auth-event') {
        setError('Google 로그인에 실패했어요. 다시 시도해 주세요.');
      }
    });

    // Watch auth state — treat anonymous users as unauthenticated for admin purposes
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || user.isAnonymous) {
        setStatus('unauthenticated');
        return;
      }
      setStatus('checking');
      try {
        const isAdmin = await fetchIsAdmin(user.uid);
        setStatus(isAdmin ? 'admin' : 'denied');
      } catch {
        setStatus('denied');
      }
    });

    return unsub;
  }, []);

  // Redirect to Google — no popup, no COOP issue.
  // Page navigates away → Google auth → returns to /admin → onAuthStateChanged fires.
  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      const user = auth.currentUser;
      if (user && user.isAnonymous) {
        // Upgrade anonymous session to Google account
        await linkWithRedirect(user, googleProvider);
      } else {
        await signInWithRedirect(auth, googleProvider);
      }
      // Execution stops here — page navigates to Google
    } catch (err) {
      setError('Google 로그인을 시작할 수 없어요. 다시 시도해 주세요.');
      setStatus('unauthenticated');
      console.error('[useAdminAuth] redirect error:', err);
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    // onAuthStateChanged will set status to 'unauthenticated'
  }, []);

  return { status, error, signInWithGoogle, signOut };
}