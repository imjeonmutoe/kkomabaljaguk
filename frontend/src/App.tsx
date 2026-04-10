import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { getRedirectResult } from 'firebase/auth';
import { auth } from './lib/firebase';

// Lazy-load pages to keep initial bundle small
const Timeline = lazy(() => import('./pages/Timeline').then((m) => ({ default: m.Timeline })));
const Report = lazy(() => import('./pages/Report').then((m) => ({ default: m.Report })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Terms').then((m) => ({ default: m.Terms })));
const MyPage = lazy(() => import('./pages/MyPage').then((m) => ({ default: m.MyPage })));

function PageLoader() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Handle Google redirect result on app load (after signInWithRedirect / linkWithRedirect)
function RedirectHandler() {
  useEffect(() => {
    getRedirectResult(auth).catch(() => {
      // auth/credential-already-in-use: user already linked elsewhere, ignore
    });
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <RedirectHandler />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Timeline />} />
          <Route path="/report" element={<Report />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/mypage" element={<MyPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}