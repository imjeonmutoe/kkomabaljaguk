import type { Timestamp } from 'firebase/firestore';

export type DealStatus = 'pending' | 'approved' | 'rejected';

export interface NaverProduct {
  title: string;
  link: string;       // Naver Partners affiliate link
  image: string;
  lprice: string;     // lowest price (string from API)
  mallName: string;
}

export interface Deal {
  id: string;
  productName: string;
  brand: string;
  category: string;
  startAt: Timestamp;
  endAt: Timestamp;
  price: number;
  instagramUrl: string;
  oembedHtml: string;
  naverProducts: NaverProduct[];
  naverUpdatedAt: Timestamp | null;
  status: DealStatus;
  reporterId: string;
  createdAt: Timestamp;
  approvedAt?: Timestamp | null;
  viewCount: number;
}

export interface User {
  id: string;
  fcmToken: string | null;
  keywords: string[];
  notificationConsent: boolean;
  lastActiveAt: Timestamp;
}

export interface Alarm {
  id: string;
  userId: string;
  dealId: string;
  createdAt: Timestamp;
  notifiedAt: Timestamp | null;
}