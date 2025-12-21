import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/context/UserContext';
import { Onboarding } from './Onboarding';

const Index = () => {
  const navigate = useNavigate();
  const { isOnboarded } = useUser();

  useEffect(() => {
    if (isOnboarded) {
      navigate('/feed');
    }
  }, [isOnboarded, navigate]);

  return <Onboarding />;
};

export default Index;
