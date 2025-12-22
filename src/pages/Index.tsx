import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useHasCompletedOnboarding } from '@/hooks/useProfile';
import { Onboarding } from './Onboarding';

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: hasCompleted, isLoading: onboardingLoading } = useHasCompletedOnboarding();

  // Handle all navigation in useEffect to avoid side effects during render
  useEffect(() => {
    if (authLoading || onboardingLoading) return;
    
    if (!user) {
      navigate('/auth');
      return;
    }
    
    if (hasCompleted) {
      navigate('/feed');
    }
  }, [user, hasCompleted, authLoading, onboardingLoading, navigate]);

  // Show loading while checking auth/onboarding status
  if (authLoading || onboardingLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Show loading while redirect is happening
  if (!user || hasCompleted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return <Onboarding />;
};

export default Index;
