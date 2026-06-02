import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import { Seo } from '@/components/Seo';
import { BetaBadge } from '@/components/BetaBadge';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');
const nameSchema = z.string().min(2, 'Name must be at least 2 characters');

export const Auth = () => {
  const navigate = useNavigate();
  const { user, signUp, signIn, loading } = useAuth();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  
  // Sign In form
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  
  // Sign Up form
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpName, setSignUpName] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const emailResult = emailSchema.safeParse(signInEmail);
    if (!emailResult.success) {
      toast.error(emailResult.error.errors[0].message);
      return;
    }
    
    const passwordResult = passwordSchema.safeParse(signInPassword);
    if (!passwordResult.success) {
      toast.error(passwordResult.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);
    const { error } = await signIn(signInEmail, signInPassword);
    setIsSubmitting(false);

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        toast.error('Invalid email or password. Please try again.');
      } else if (error.message.includes('Email not confirmed')) {
        toast.error('Please check your email and confirm your account first.');
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success('Welcome back!');
      navigate('/');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const nameResult = nameSchema.safeParse(signUpName);
    if (!nameResult.success) {
      toast.error(nameResult.error.errors[0].message);
      return;
    }
    
    const emailResult = emailSchema.safeParse(signUpEmail);
    if (!emailResult.success) {
      toast.error(emailResult.error.errors[0].message);
      return;
    }
    
    const passwordResult = passwordSchema.safeParse(signUpPassword);
    if (!passwordResult.success) {
      toast.error(passwordResult.error.errors[0].message);
      return;
    }

    setIsSubmitting(true);
    const { error } = await signUp(signUpEmail, signUpPassword, signUpName);
    setIsSubmitting(false);

    if (error) {
      if (error.message.includes('already registered')) {
        toast.error('This email is already registered. Please sign in instead.');
        setActiveTab('signin');
        setSignInEmail(signUpEmail);
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success('Account created! Check your email to verify your account before signing in.');
      setActiveTab('signin');
      setSignInEmail(signUpEmail);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Seo
        title="Sign in or sign up — Pulse"
        description="Create a Pulse account or sign in to take the political alignment quiz and compare your views with candidates."
        path="/auth"
      />
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/icon-192.png"
            alt="Pulse app icon"
            width={64}
            height={64}
            fetchPriority="high"
            decoding="async"
            className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-glow"
          />
          <h1 className="font-display text-3xl font-bold text-foreground flex items-center justify-center gap-2">
            <span className="text-gradient">Pulse</span>
            <BetaBadge size="md" />
            <span className="sr-only">— Political Alignment and Donor Tracking</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Your political alignment companion
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            You're using an early beta — expect rapid changes.
          </p>
        </div>

        <Card className="shadow-elevated">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'signin' | 'signup')}>
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
            </CardHeader>
            
            <CardContent>


              <TabsContent value="signin" className="mt-0">
                <CardDescription className="mb-4">
                  Welcome back! Sign in to continue exploring.
                </CardDescription>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="you@example.com"
                        value={signInEmail}
                        onChange={(e) => setSignInEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signin-password"
                        type="password"
                        placeholder="••••••••"
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    variant="hero" 
                    className="w-full" 
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Signing in...' : 'Sign In'}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <CardDescription className="mb-4">
                  Create an account to discover your political alignment.
                </CardDescription>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="Your name"
                        value={signUpName}
                        onChange={(e) => setSignUpName(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        value={signUpEmail}
                        onChange={(e) => setSignUpEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={signUpPassword}
                        onChange={(e) => setSignUpPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    variant="hero" 
                    className="w-full" 
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Creating account...' : 'Create Account'}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          By continuing, you agree to our{' '}
          <a href="/terms" className="text-primary underline underline-offset-2 hover:text-primary/80">Terms of Service</a>{' '}
          and{' '}
          <a href="/privacy" className="text-primary underline underline-offset-2 hover:text-primary/80">Privacy Policy</a>.
        </p>
      </div>
    </main>
  );
};
