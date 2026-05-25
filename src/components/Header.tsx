import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { usePoliticianRole } from '@/hooks/usePoliticianProfile';
import { User, LayoutGrid, Menu, X, BookOpen, HelpCircle, Users, DollarSign, Shield, Building2, FileText, Landmark, Newspaper, Megaphone } from 'lucide-react';
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

  const navItems = [
    { path: '/feed', label: 'Feed', icon: LayoutGrid, requiresAuth: true },
    { path: '/candidates', label: 'Candidates', icon: Users, requiresAuth: false },
    { path: '/parties', label: 'Parties', icon: Building2, requiresAuth: true },
    { path: '/donors', label: 'Donors', icon: DollarSign, requiresAuth: false },
    { path: '/committees', label: 'Committees', icon: Landmark, requiresAuth: true },
    { path: '/top-spenders', label: 'Top Spenders', icon: Megaphone, requiresAuth: false },
    { path: '/quiz-library', label: 'Quizzes', icon: BookOpen, requiresAuth: true },
    { path: '/blog', label: 'Blog', icon: Newspaper, requiresAuth: false },
    { path: '/profile', label: 'Profile', icon: User, requiresAuth: true },
  ];

  const visibleNavItems = navItems.filter((item) => (item.requiresAuth ? !authLoading && !!user : true));

  const isActive = (path: string) => location.pathname === path;

  const userName = (user?.user_metadata as any)?.name || user?.email;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between gap-2">
        <Link to="/feed" className="flex items-center gap-2 shrink-0">
          <img src={logoImg} alt="Pulse" width={40} height={40} fetchPriority="high" decoding="async" className="w-10 h-10 object-contain" />
          <BetaBadge size="xs" />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 min-w-0">
          {visibleNavItems.map(item => (
            <Link key={item.path} to={item.path} title={item.label}>
              <Button
                variant={isActive(item.path) ? "secondary" : "ghost"}
                className={cn(
                  "gap-1.5 px-2 xl:px-3",
                  isActive(item.path) && "bg-secondary text-foreground"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="hidden xl:inline">{item.label}</span>
              </Button>
            </Link>
          ))}
          {!authLoading && user && (
            <Link to="/how-scoring-works" title="How scoring works">
              <Button variant="ghost" size="icon" className="ml-1">
                <HelpCircle className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {isPolitician && (
            <Link to="/politician">
              <Button
                variant={isActive('/politician') ? "secondary" : "ghost"}
                size="icon"
                className="ml-0.5"
                title="Politician Dashboard"
              >
                <FileText className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin">
              <Button
                variant={isActive('/admin') ? "secondary" : "ghost"}
                size="icon"
                className="ml-0.5"
                title="Admin"
              >
                <Shield className="w-4 h-4" />
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

        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
            {!authLoading && user && (
              <Link
                to="/how-scoring-works"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Button variant="ghost" className="w-full justify-start gap-3">
                  <HelpCircle className="w-5 h-5" />
                  How Scoring Works
                </Button>
              </Link>
            )}
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
