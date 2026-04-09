import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Plus, User } from 'lucide-react';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
  { label: '타임라인', path: '/',       Icon: Home },
  { label: '공유',     path: '/report', Icon: Plus },
  { label: '내 정보',  path: '/mypage', Icon: User },
] as const;

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  function isActive(path: string): boolean {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-stone-200">
      <div className="max-w-lg mx-auto px-4">
        <div className="flex items-center justify-around py-2">
          {NAV_ITEMS.map(({ label, path, Icon }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 px-6 py-2 rounded-lg transition-colors',
                  active ? 'text-orange-500' : 'text-stone-400 hover:text-stone-600'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}