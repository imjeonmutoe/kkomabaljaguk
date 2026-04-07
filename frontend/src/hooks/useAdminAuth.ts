import { useState, useEffect, useCallback } from 'react';
import {
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type AuthError,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminStatus =
  | 'loading'          // auth state not yet resolved
  | 'unauthenticated'  // no Google sign-in yet
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

async function checkAndSetAdmin(
  uid: string,
  setStatus: (s: AdminStatus) => void,
  setError: (e: string | null) => void,
) {
  setStatus('checking');
  try {
    const isAdmin = await fetchIsAdmin(uid);
    setStatus(isAdmin ? 'admin' : 'denied');
  } catch (e) {
    console.error('[useAdminAuth] fetchIsAdmin error:', e);
    setError('관리자 정보를 확인할 수 없어요.');
    setStatus('denied');
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAdminAuth(): UseAdminAuthResult {
  const [status, setStatus] = useState<AdminStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Step 1: process any pending Google redirect result
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) {
          console.log('[useAdminAuth] getRedirectResult: no pending result');
          return;
        }
        console.log('[useAdminAuth] getRedirectResult: user =', result.user.uid);
        await checkAndSetAdmin(result.user.uid, setStatus, setError);
      })
      .catch(async (err: AuthError) => {
        console.error('[useAdminAuth] getRedirectResult error:', err.code, err.message);
        // Google account already linked to another Firebase user — sign in with that credential
        if (err.code === 'auth/credential-already-in-use' && err.customData) {
          try {
            const { OAuthProvider } = await import('firebase/auth');
            const credential = OAuthProvider.credentialFromError(err);
            if (credential) {
              const result = await signInWithCredential(auth, credential);
              await checkAndSetAdmin(result.user.uid, setStatus, setError);
              return;
            }
          } catch (e) {
            console.error('[useAdminAuth] signInWithCredential fallback error:', e);
          }
        }
        if (err.code !== 'auth/no-auth-event') {
          setError('Google 로그인에 실패했어요. 다시 시도해 주세요.');
          setStatus('unauthenticated');
        }
      });

    // Step 2: watch ongoing auth state
    const unsub = onAuthStateChanged(auth, async (user) => {
      console.log('[useAdminAuth] onAuthStateChanged: user =', user?.uid, 'anonymous =', user?.isAnonymous);
      if (!user || user.isAnonymous) {
        setStatus((prev) => prev === 'loading' ? 'unauthenticated' : prev);
        return;
      }
      // Non-anonymous Google user — check admin (unless getRedirectResult already handled it)
      setStatus((prev) => {
        if (prev === 'admin' || prev === 'denied' || prev === 'checking') return prev;
        return 'checking';
      });
      await checkAndSetAdmin(user.uid, setStatus, setError);
    });

    return unsub;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      // Always use redirect (no popup) — avoids COOP issues in all environments
      await signInWithRedirect(auth, googleProvider);
      // Page navigates away — code below never runs
    } catch (err) {
      console.error('[useAdminAuth] signInWithRedirect error:', err);
      setError('Google 로그인을 시작할 수 없어요. 다시 시도해 주세요.');
      setStatus('unauthenticated');
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  return { status, error, signInWithGoogle, signOut };
}