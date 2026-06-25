import { useLocation, useNavigate } from 'react-router-dom';
import { Users, FileText, Target, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const HIDDEN_PATHS = ['/auth', '/onboarding', '/verify-email', '/quiz'];

const tabs = [
  {
    key: 'candidates',
    label: 'Candidates',
    icon: Users,
    to: '/candidates',
    requiresAuth: false,
    isActive: (p: string) => p === '/candidates' || p.startsWith('/candidate/') || p === '/compare',
  },
  {
    key: 'issues',
    label: 'Issues',
    icon: FileText,
    to: '/issues',
    requiresAuth: false,
    isActive: (p: string) => p === '/issues' || p.startsWith('/bill/'),
  },
  {
    key: 'quiz',
    label: 'Quiz',
    icon: Target,
    to: '/quiz-library',
    requiresAuth: true,
    isActive: (p: string) => p === '/quiz-library' || p === '/quiz' || p === '/results',
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: User,
    to: '/profile',
    requiresAuth: true,
    isActive: (p: string) => p === '/profile',
  },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const hidden =
    HIDDEN_PATHS.includes(pathname) ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/r/card') ||
    pathname.startsWith('/p/');

  if (hidden) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white border-t border-poli-surface">
      <div className="flex items-stretch h-16 pb-4">
        {tabs.map((tab) => {
          const active = tab.isActive(pathname);
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.requiresAuth && !user ? '/auth' : tab.to)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
            >
              <span
                className={cn(
                  'flex items-center justify-center w-10 h-6 rounded-full transition-colors',
                  active ? 'bg-poli-surface/60' : 'bg-transparent',
                )}
              >
                <Icon
                  width={22}
                  height={22}
                  strokeWidth={active ? 2.2 : 1.8}
                  className={active ? 'text-poli-navy' : 'text-poli-muted'}
                />
              </span>
              <span
                className={cn(
                  'text-[10px] font-semibold font-mono-label uppercase tracking-wide',
                  active ? 'text-poli-navy' : 'text-poli-muted',
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
