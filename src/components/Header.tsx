import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/context/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { usePoliticianRole } from '@/hooks/usePoliticianProfile';
import { User, LayoutGrid, Menu, X, BookOpen, HelpCircle, Users, DollarSign, Shield, Building2, FileText, Landmark, Newspaper } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import logoImg from '@/assets/logo.png';

export const Header = () => {
  const location = useLocation();
  const { user } = useUser();
  const { loading: authLoading } = useAuth();
  const { data: adminData, isLoading: adminLoading } = useAdminRole();
  const { data: politicianData, isLoading: politicianLoading } = usePoliticianRole();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Only treat role flags as true once their queries have settled, to prevent flash of admin/politician icons.
  const isAdmin = !!user && !adminLoading && !!adminData?.isAdmin;
  const isPolitician = !!user && !politicianLoading && !!politicianData?.isPolitician;

  const navItems = [
    { path: '/feed', label: 'Feed', icon: LayoutGrid, requiresAuth: true },
    { path: '/candidates', label: 'Candidates', icon: Users, requiresAuth: false },
    { path: '/parties', label: 'Parties', icon: Building2, requiresAuth: true },
    { path: '/donors', label: 'Donors', icon: DollarSign, requiresAuth: false },
    { path: '/committees', label: 'Committees', icon: Landmark, requiresAuth: true },
    { path: '/quiz-library', label: 'Quizzes', icon: BookOpen, requiresAuth: true },
    { path: '/blog', label: 'Blog', icon: Newspaper, requiresAuth: false },
    { path: '/profile', label: 'Profile', icon: User, requiresAuth: true },
  ];

  const visibleNavItems = navItems.filter((item) => (item.requiresAuth ? !!user : true));

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/feed" className="flex items-center gap-2">
          <img src={logoImg} alt="Pulse" className="w-10 h-10 object-contain" />
          <span className="font-display text-xl font-bold text-primary">Pulse</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {visibleNavItems.map(item => (
            <Link key={item.path} to={item.path}>
              <Button 
                variant={isActive(item.path) ? "secondary" : "ghost"}
                className={cn(
                  "gap-2",
                  isActive(item.path) && "bg-secondary text-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Button>
            </Link>
          ))}
          <Link to="/how-scoring-works">
            <Button variant="ghost" size="icon" className="ml-2">
              <HelpCircle className="w-4 h-4" />
            </Button>
          </Link>
          {isPolitician && (
            <Link to="/politician">
              <Button 
                variant={isActive('/politician') ? "secondary" : "ghost"}
                size="icon"
                className="ml-1"
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
                className="ml-1"
                title="Admin"
              >
                <Shield className="w-4 h-4" />
              </Button>
            </Link>
          )}
        </nav>

        {/* User Info */}
        <div className="hidden md:flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <User className="w-3 h-3 text-primary-foreground" />
              </div>
              <span className="text-sm font-medium text-foreground">{user.name}</span>
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background animate-slide-up">
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
            <Link 
              to="/how-scoring-works"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Button variant="ghost" className="w-full justify-start gap-3">
                <HelpCircle className="w-5 h-5" />
                How Scoring Works
              </Button>
            </Link>
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
