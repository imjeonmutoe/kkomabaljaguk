import { useState, useEffect } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { auth, db, getMessagingInstance } from '../lib/firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;

export interface UseFCMResult {
  /** Save FCM token to Firestore after requesting notification permission */
  saveToken: () => Promise<boolean>;
  /** True if the user has already granted notification consent */
  hasConsent: boolean;
}

export function useFCM(): UseFCMResult {
  const [hasConsent, setHasConsent] = useState(false);

  // Sign in anonymously on mount — no email/name collected (Firebase Anonymous Auth only)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Touch lastActiveAt silently
        setDoc(doc(db, 'users', user.uid), { lastActiveAt: serverTimestamp() }, { merge: true })
          .catch(() => {});

        // Restore consent state from Firestore so UI reflects prior consent on revisit
        getDoc(doc(db, 'users', user.uid))
          .then((snap) => {
            if (snap.exists() && snap.data().notificationConsent === true) {
              setHasConsent(true);
            }
          })
          .catch(() => {});
      }
    });

    // Sign in if not already authenticated
    if (!auth.currentUser) {
      signInAnonymously(auth).catch((err) =>
        console.error('[useFCM] anonymous sign-in error:', err)
      );
    }

    return unsubscribe;
  }, []);

  /**
   * Request notification permission, obtain FCM token, and save to Firestore.
   * Returns true if the token was saved successfully, false otherwise.
   */
  const saveToken = async (): Promise<boolean> => {
    const user = auth.currentUser;
    if (!user) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const messaging = await getMessagingInstance();
    if (!messaging) return false;

    try {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });

      await setDoc(
        doc(db, 'users', user.uid),
        {
          fcmToken: token,
          notificationConsent: true,
          lastActiveAt: serverTimestamp(),
        },
        { merge: true }
      );

      setHasConsent(true);

      // Handle foreground push messages
      onMessage(messaging, (payload) => {
        console.info('[FCM] foreground message:', payload);
      });

      return true;
    } catch (err) {
      console.error('[useFCM] saveToken error:', err);
      return false;
    }
  };

  return { saveToken, hasConsent };
}