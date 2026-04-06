import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Clock, Heart, User } from 'lucide-react';
import { cn } from '../lib/utils';

const NAV_ITEMS = [
  { label: '홈',      path: '/home',     Icon: Home },
  { label: '타임라인', path: '/',         Icon: Clock },
  { label: '관심목록', path: '/wishlist', Icon: Heart },
  { label: '마이페이지', path: '/mypage', Icon: User },
] as const;

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  function isActive(path: string): boolean {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-pb">
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
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className={cn('w-5 h-5', active && 'fill-primary/20')} />
                <span className="text-xs font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}