import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useHasCompletedOnboarding } from '@/hooks/useProfile';
import { Onboarding } from './Onboarding';

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: hasCompleted, isLoading: onboardingLoading } = useHasCompletedOnboarding();

  useEffect(() => {
    if (!authLoading && !onboardingLoading && hasCompleted) {
      navigate('/feed');
    }
  }, [hasCompleted, authLoading, onboardingLoading, navigate]);

  if (authLoading || onboardingLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    navigate('/auth');
    return null;
  }

  return <Onboarding />;
};

export default Index;
