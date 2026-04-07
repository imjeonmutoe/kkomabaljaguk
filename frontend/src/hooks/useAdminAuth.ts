import { useState, useEffect, useCallback } from 'react';
import {
  linkWithPopup,
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

  // Watch auth state — treat anonymous users as unauthenticated for admin purposes
  useEffect(() => {
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
      const user = auth.currentUser;

      if (user && user.isAnonymous) {
        // Upgrade: link the anonymous session to a Google account
        try {
          await linkWithPopup(user, googleProvider);
        } catch (err) {
          const code = (err as AuthError).code;
          if (code === 'auth/credential-already-in-use') {
            // Google account already has its own Firebase account — sign in directly
            await signInWithPopup(auth, googleProvider);
          } else {
            throw err;
          }
        }
      } else {
        await signInWithPopup(auth, googleProvider);
      }
      // onAuthStateChanged handles status update after successful sign-in
    } catch (err) {
      const code = (err as AuthError).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setStatus('unauthenticated');
        return;
      }
      setError('Google 로그인에 실패했어요. 다시 시도해 주세요.');
      setStatus('unauthenticated');
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    // onAuthStateChanged will set status to 'unauthenticated'
  }, []);

  return { status, error, signInWithGoogle, signOut };
}