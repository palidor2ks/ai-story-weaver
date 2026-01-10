import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useHasCompletedOnboarding } from '@/hooks/useProfile';
import { Onboarding } from './Onboarding';
import { LoadingScreen } from '@/components/LoadingScreen';

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const { data: hasCompleted, isLoading: onboardingLoading } = useHasCompletedOnboarding();

  // Show loading while checking auth/onboarding status
  if (authLoading || onboardingLoading) {
    return <LoadingScreen />;
  }

  // Not logged in - redirect to auth
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Completed onboarding - redirect to feed
  if (hasCompleted) {
    return <Navigate to="/feed" replace />;
  }

  // User logged in but hasn't completed onboarding - show onboarding
  return <Onboarding />;
};

export default Index;
