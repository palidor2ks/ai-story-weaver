import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Users, Target, User, Menu, Building2, HelpCircle, Newspaper, Shield, FileText as FileTextIcon, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { usePoliticianRole } from '@/hooks/usePoliticianProfile';
import { cn } from '@/lib/utils';

const HIDDEN_PATHS = ['/auth', '/onboarding', '/verify-email', '/quiz'];

const MORE_ACTIVE_PATHS = ['/parties', '/blog', '/how-scoring-works', '/politician'];

const primaryTabs = [
  {
    key: 'candidates',
    label: 'Candidates',
    icon: Users,
    to: '/candidates',
    requiresAuth: false,
    isActive: (p: string) => p === '/candidates' || p.startsWith('/candidate/') || p === '/compare',
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
  const { data: adminData } = useAdminRole();
  const { data: politicianData } = usePoliticianRole();
  const [moreOpen, setMoreOpen] = useState(false);

  const hidden =
    HIDDEN_PATHS.includes(pathname) ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/r/card') ||
    pathname.startsWith('/p/');

  if (hidden) return null;

  const isMoreActive =
    MORE_ACTIVE_PATHS.some((p) => pathname === p) || pathname.startsWith('/admin');

  const handleMoreItem = (to: string) => {
    setMoreOpen(false);
    navigate(to);
  };

  const isAdmin = !!user && !!adminData?.isAdmin;
  const isPolitician = !!user && !!politicianData?.isPolitician;

  return (
    <>
      {/* More sheet backdrop */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More sheet */}
      {moreOpen && (
        <div className="fixed bottom-16 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl border-t border-poli-surface">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="font-mono-label text-[10px] font-bold text-poli-red uppercase tracking-widest">
              More
            </span>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="text-poli-muted hover:text-poli-body p-1"
            >
              <X width={18} height={18} />
            </button>
          </div>
          <div className="px-4 pb-4">
            {[
              { label: 'Parties', icon: Building2, to: '/parties' },
              { label: 'How it works', icon: HelpCircle, to: '/how-scoring-works' },
              { label: 'Blog', icon: Newspaper, to: '/blog' },
              ...(isPolitician ? [{ label: 'Politician Dashboard', icon: FileTextIcon, to: '/politician' }] : []),
              ...(isAdmin ? [{ label: 'Admin', icon: Shield, to: '/admin' }] : []),
            ].map((item) => (
              <button
                key={item.to}
                type="button"
                onClick={() => handleMoreItem(item.to)}
                className="flex items-center gap-3 w-full py-3 border-b border-poli-surface last:border-0"
              >
                <item.icon width={20} height={20} className="text-poli-muted shrink-0" />
                <span className="text-poli-body font-medium text-sm">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white border-t border-poli-surface">
        <div className="flex items-stretch h-16 pb-4">
          {primaryTabs.map((tab) => {
            const active = tab.isActive(pathname);
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  navigate(tab.requiresAuth && !user ? '/auth' : tab.to);
                }}
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

          {/* More tab */}
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5"
          >
            <span
              className={cn(
                'flex items-center justify-center w-10 h-6 rounded-full transition-colors',
                isMoreActive || moreOpen ? 'bg-poli-surface/60' : 'bg-transparent',
              )}
            >
              <Menu
                width={22}
                height={22}
                strokeWidth={isMoreActive || moreOpen ? 2.2 : 1.8}
                className={isMoreActive || moreOpen ? 'text-poli-navy' : 'text-poli-muted'}
              />
            </span>
            <span
              className={cn(
                'text-[10px] font-semibold font-mono-label uppercase tracking-wide',
                isMoreActive || moreOpen ? 'text-poli-navy' : 'text-poli-muted',
              )}
            >
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
