import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

export const IdMeCallback = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Completing your ID.me identity verification…');

  const redirectUri = useMemo(() => `${window.location.origin}/auth/idme-callback`, []);

  useEffect(() => {
    let isMounted = true;

    const finishVerification = async () => {
      const code = searchParams.get('code');
      const returnedState = searchParams.get('state');
      const providerError = searchParams.get('error');
      const providerErrorDescription = searchParams.get('error_description');
      const expectedState = sessionStorage.getItem('idme_state');

      if (providerError) {
        const errorMessage = providerErrorDescription || providerError;
        throw new Error(`ID.me returned an error: ${errorMessage}`);
      }

      if (!code || !returnedState) {
        throw new Error('Missing ID.me authorization response. Please start verification again.');
      }

      if (!expectedState || returnedState !== expectedState) {
        throw new Error('Unable to validate the ID.me response. Please start verification again.');
      }

      const { data, error } = await supabase.functions.invoke('verify-identity-idme', {
        body: {
          action: 'verify',
          code,
          redirect_uri: redirectUri,
        },
      });

      if (error) {
        throw error;
      }

      if (data?.error || data?.success !== true) {
        throw new Error(data?.message || 'ID.me verification could not be completed.');
      }

      sessionStorage.removeItem('idme_state');
      await queryClient.invalidateQueries({ queryKey: ['profile'] });

      if (!isMounted) return;
      setStatus('success');
      setMessage('Identity verified successfully. Redirecting to your profile…');
      toast.success('Identity verified successfully!');

      window.setTimeout(() => {
        navigate('/profile', { replace: true });
      }, 1200);
    };

    finishVerification().catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to complete identity verification.';
      console.error('ID.me callback error:', error);
      sessionStorage.removeItem('idme_state');
      if (!isMounted) return;
      setStatus('error');
      setMessage(errorMessage);
      toast.error(errorMessage);
    });

    return () => {
      isMounted = false;
    };
  }, [navigate, queryClient, redirectUri, searchParams]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {status === 'loading' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : status === 'success' ? (
              <ShieldCheck className="h-6 w-6" />
            ) : (
              <TriangleAlert className="h-6 w-6" />
            )}
          </div>
          <CardTitle>
            {status === 'loading'
              ? 'Verifying identity'
              : status === 'success'
                ? 'Identity verified'
                : 'Verification failed'}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        {status === 'error' && (
          <CardContent>
            <Button onClick={() => navigate('/profile', { replace: true })} className="w-full">
              Back to profile
            </Button>
          </CardContent>
        )}
      </Card>
    </main>
  );
};

export default IdMeCallback;
