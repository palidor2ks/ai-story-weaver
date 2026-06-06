import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { usePoliticianRole } from '@/hooks/usePoliticianProfile';
import { User, Menu, X, BookOpen, HelpCircle, Users, DollarSign, Shield, Building2, FileText, Landmark, Newspaper, Megaphone, LogIn, Briefcase, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import logoImg from '@/assets/logo.png';
import { BetaBadge } from '@/components/BetaBadge';

export const Header = () => {
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { data: adminData, isLoading: adminLoading } = useAdminRole();
  const { data: politicianData, isLoading: politicianLoading } = usePoliticianRole();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAdmin = !!user && !adminLoading && !!adminData?.isAdmin;
  const isPolitician = !!user && !politicianLoading && !!politicianData?.isPolitician;

  const navItems: { path: string; label: string; icon: LucideIcon; requiresAuth: boolean; adminOnly?: boolean }[] = [
    { path: '/candidates', label: 'Candidates', icon: Users, requiresAuth: false },
    { path: '/parties', label: 'Parties', icon: Building2, requiresAuth: false },
    { path: '/donors', label: 'Donors', icon: DollarSign, requiresAuth: false },
    { path: '/committees', label: 'Committees', icon: Landmark, requiresAuth: false },
    { path: '/top-spenders', label: 'Top Spenders', icon: Megaphone, requiresAuth: false },
    { path: '/how-scoring-works', label: 'How it works', icon: HelpCircle, requiresAuth: false },
    { path: '/quiz-library', label: 'Quizzes', icon: BookOpen, requiresAuth: true },
    { path: '/blog', label: 'Blog', icon: Newspaper, requiresAuth: false },
    { path: '/jobs', label: 'Jobs', icon: Briefcase, requiresAuth: false },
    { path: '/profile', label: 'Profile', icon: User, requiresAuth: true },
  ];

  const visibleNavItems = navItems.filter((item) => {
    if (item.adminOnly) return isAdmin;
    return item.requiresAuth ? !authLoading && !!user : true;
  });

  const isActive = (path: string) => location.pathname === path;

  const userName = (user?.user_metadata?.name as string | undefined) || user?.email;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between gap-2">
        <Link to="/candidates" className="flex items-center gap-2 shrink-0">
          <img src={logoImg} alt="Pulse — political alignment and donor tracking" width={40} height={40} fetchPriority="high" decoding="async" className="w-10 h-10 object-contain" />
          <BetaBadge size="xs" />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex flex-1 items-center justify-center gap-0.5 min-w-0">
          {visibleNavItems.map(item => (
            <Link key={item.path} to={item.path} title={item.label} aria-label={item.label}>
              <Button
                variant={isActive(item.path) ? "secondary" : "ghost"}
                className={cn(
                  "gap-1.5 px-2 text-xs xl:px-3 xl:text-sm",
                  isActive(item.path) && "bg-secondary text-foreground"
                )}
                aria-label={item.label}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="hidden min-[1120px]:inline">{item.label}</span>
              </Button>
            </Link>
          ))}
          {isPolitician && (
            <Link to="/politician">
              <Button
                variant={isActive('/politician') ? "secondary" : "ghost"}
                className={cn(
                  "ml-0.5 gap-1.5 px-2 text-xs xl:px-3 xl:text-sm",
                  isActive('/politician') && "bg-secondary text-foreground"
                )}
                title="Politician Dashboard"
                aria-label="Politician Dashboard"
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span className="hidden min-[1120px]:inline">Dashboard</span>
              </Button>
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin">
              <Button
                variant={isActive('/admin') ? "secondary" : "ghost"}
                className={cn(
                  "ml-0.5 gap-1.5 px-2 text-xs xl:px-3 xl:text-sm",
                  isActive('/admin') && "bg-secondary text-foreground"
                )}
                title="Admin"
                aria-label="Admin"
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span className="hidden min-[1120px]:inline">Admin</span>
              </Button>
            </Link>
          )}
        </nav>

        {/* User Info */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          {user && (
            <div className="flex items-center gap-2 lg:px-1.5 xl:px-3 lg:py-1 xl:py-1.5 rounded-full lg:bg-transparent xl:bg-secondary">
              <div className="w-7 h-7 xl:w-6 xl:h-6 rounded-full bg-primary flex items-center justify-center">
                <User className="w-3.5 h-3.5 xl:w-3 xl:h-3 text-primary-foreground" />
              </div>
              <span className="hidden xl:inline text-sm font-medium text-foreground max-w-[140px] truncate">{userName}</span>
            </div>
          )}
        </div>

        {!authLoading && !user && (
          <div className="hidden lg:flex items-center shrink-0">
            <Link to="/auth">
              <Button variant="default" className="gap-2">
                <LogIn className="w-4 h-4" />
                <span>Login / Sign Up</span>
              </Button>
            </Link>
          </div>
        )}

        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-border bg-background animate-slide-up">
          <nav className="container py-4 space-y-2">
            {visibleNavItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Button
                  variant={isActive(item.path) ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3"
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Button>
              </Link>
            ))}
            {isPolitician && (
              <Link
                to="/politician"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Button
                  variant={isActive('/politician') ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3"
                >
                  <FileText className="w-5 h-5" />
                  My Dashboard
                </Button>
              </Link>
            )}
            {!authLoading && !user && (
              <Link
                to="/auth"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Button variant="default" className="w-full justify-start gap-3">
                  <LogIn className="w-5 h-5" />
                  Login / Sign Up
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Button
                  variant={isActive('/admin') ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3"
                >
                  <Shield className="w-5 h-5" />
                  Admin
                </Button>
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};
