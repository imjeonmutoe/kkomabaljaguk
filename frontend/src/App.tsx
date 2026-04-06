import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Lazy-load pages to keep initial bundle small
const Timeline = lazy(() => import('./pages/Timeline').then((m) => ({ default: m.Timeline })));
const DealDetail = lazy(() => import('./pages/DealDetail').then((m) => ({ default: m.DealDetail })));
const Report = lazy(() => import('./pages/Report').then((m) => ({ default: m.Report })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Terms').then((m) => ({ default: m.Terms })));

function PageLoader() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Timeline />} />
          <Route path="/deal/:dealId" element={<DealDetail />} />
          <Route path="/report" element={<Report />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}