import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

interface WishlistCtx {
  wishlistedIds: Set<string>;
  toggle: (dealId: string) => Promise<void>;
}

const WishlistContext = createContext<WishlistCtx>({
  wishlistedIds: new Set(),
  toggle: async () => {},
});

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    return auth.onAuthStateChanged((u) => setUid(u?.uid ?? null));
  }, []);

  useEffect(() => {
    if (!uid) { setWishlistedIds(new Set()); return; }
    const ref = collection(db, 'users', uid, 'wishlist');
    return onSnapshot(ref, (snap) => {
      setWishlistedIds(new Set(snap.docs.map((d) => d.id)));
    });
  }, [uid]);

  const toggle = useCallback(async (dealId: string) => {
    if (!uid) return;
    const ref = doc(db, 'users', uid, 'wishlist', dealId);
    if (wishlistedIds.has(dealId)) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, { dealId, addedAt: serverTimestamp() });
    }
  }, [uid, wishlistedIds]);

  const value = useMemo(() => ({ wishlistedIds, toggle }), [wishlistedIds, toggle]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  return useContext(WishlistContext);
}