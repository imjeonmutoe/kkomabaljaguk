import { useState, useEffect, useCallback } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type AuthError,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminStatus =
  | 'loading'          // auth state not yet resolved
  | 'unauthenticated'  // no Google sign-in
  | 'checking'         // checking admins collection
  | 'admin'            // confirmed admin
  | 'denied';          // not in admins collection

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

  // Dev bypass: skip Google auth entirely in local dev
  useEffect(() => {
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN === 'true') {
      setStatus('admin');
      return;
    }
  }, []);

  // Watch auth state — handles page refresh where user is already Google-signed-in
  useEffect(() => {
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN === 'true') return;
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

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setStatus('checking');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged will also fire, but we can set directly here
      const isAdmin = await fetchIsAdmin(result.user.uid);
      setStatus(isAdmin ? 'admin' : 'denied');
    } catch (err) {
      const code = (err as AuthError).code;
      // User closed the popup — not an error
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setStatus('unauthenticated');
        return;
      }
      if (code === 'auth/popup-blocked') {
        setError('팝업이 차단됐어요. 주소창 오른쪽 팝업 허용 후 다시 시도해 주세요.');
        setStatus('unauthenticated');
        return;
      }
      console.error('[useAdminAuth] signInWithPopup error:', code, err);
      setError('Google 로그인에 실패했어요. 다시 시도해 주세요.');
      setStatus('unauthenticated');
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  return { status, error, signInWithGoogle, signOut };
}