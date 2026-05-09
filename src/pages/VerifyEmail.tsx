import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, RefreshCw, LogOut } from 'lucide-react';

export default function VerifyEmail() {
  const { user, signOut } = useAuth();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleResend = async () => {
    if (!user?.email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setResending(false);
    if (error) toast.error(error.message);
    else toast.success('Verification email sent. Check your inbox.');
  };

  const handleCheck = async () => {
    setChecking(true);
    const { data, error } = await supabase.auth.refreshSession();
    setChecking(false);
    if (error) {
      toast.error('Could not refresh session. Try signing out and back in.');
      return;
    }
    if (data.user?.email_confirmed_at) {
      toast.success('Email verified!');
      window.location.href = '/';
    } else {
      toast.message('Still not verified. Check your inbox and click the link.');
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 mx-auto mb-3 flex items-center justify-center">
            <Mail className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="font-display text-2xl">Verify your email</CardTitle>
          <CardDescription className="mt-2">
            We sent a verification link to <span className="font-semibold text-foreground">{user?.email}</span>.
            Click the link in that email to activate your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleCheck} variant="hero" className="w-full" disabled={checking}>
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking...' : "I've verified — continue"}
          </Button>
          <Button onClick={handleResend} variant="outline" className="w-full" disabled={resending}>
            {resending ? 'Sending...' : 'Resend verification email'}
          </Button>
          <Button onClick={() => signOut()} variant="ghost" className="w-full">
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
          <p className="text-xs text-muted-foreground text-center pt-2">
            Don't see it? Check your spam folder. The link expires after a short time — use Resend if needed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
