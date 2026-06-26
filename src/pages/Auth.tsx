import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Mail, Lock, User } from 'lucide-react';
import { z } from 'zod';
import { Seo } from '@/components/Seo';

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
      <div className="min-h-screen bg-[#F5F6FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poli-navy" />
      </div>
    );
  }

  return (
    <main className="bg-[#F5F6FA] min-h-screen flex flex-col items-center justify-center p-6">
      <Seo
        title="Sign in or sign up — Pulse"
        description="Create a Pulse account or sign in to take the political alignment quiz and compare your views with candidates."
        path="/auth"
      />

      {/* Logo block */}
      <div className="flex flex-col items-center">
        <div className="bg-poli-navy rounded-2xl w-16 h-16 flex items-center justify-center shadow-lg">
          <span className="text-3xl font-black text-white">P</span>
        </div>
        <span className="text-2xl font-black text-poli-navy mt-3">Pulse</span>
        <span className="bg-poli-surface text-poli-dim text-[10px] font-mono-label font-bold px-2 py-0.5 rounded-full uppercase tracking-widest mt-1">
          Beta
        </span>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm mx-auto mt-6 p-6">

        {/* Tab switcher */}
        <div className="bg-poli-surface rounded-full p-1 flex mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('signin')}
            className={
              activeTab === 'signin'
                ? 'bg-white rounded-full shadow-sm text-poli-navy font-bold flex-1 py-2 text-sm text-center'
                : 'text-poli-muted flex-1 py-2 text-sm text-center cursor-pointer'
            }
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('signup')}
            className={
              activeTab === 'signup'
                ? 'bg-white rounded-full shadow-sm text-poli-navy font-bold flex-1 py-2 text-sm text-center'
                : 'text-poli-muted flex-1 py-2 text-sm text-center cursor-pointer'
            }
          >
            Sign Up
          </button>
        </div>

        {/* Sign In form */}
        {activeTab === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poli-muted" />
              <input
                id="signin-email"
                type="email"
                placeholder="you@example.com"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                required
                className="border border-poli-surface/80 rounded-xl h-12 px-4 pl-10 w-full text-sm focus:ring-1 focus:ring-poli-navy focus:border-poli-navy outline-none bg-white text-poli-body placeholder:text-poli-muted"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poli-muted" />
              <input
                id="signin-password"
                type="password"
                placeholder="••••••••"
                value={signInPassword}
                onChange={(e) => setSignInPassword(e.target.value)}
                required
                className="border border-poli-surface/80 rounded-xl h-12 px-4 pl-10 w-full text-sm focus:ring-1 focus:ring-poli-navy focus:border-poli-navy outline-none bg-white text-poli-body placeholder:text-poli-muted"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{ background: 'linear-gradient(90deg, #182B7A, #B3122F)' }}
              className="w-full h-12 rounded-xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-60"
            >
              {isSubmitting ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>
        )}

        {/* Sign Up form */}
        {activeTab === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poli-muted" />
              <input
                id="signup-name"
                type="text"
                placeholder="Your name"
                value={signUpName}
                onChange={(e) => setSignUpName(e.target.value)}
                required
                className="border border-poli-surface/80 rounded-xl h-12 px-4 pl-10 w-full text-sm focus:ring-1 focus:ring-poli-navy focus:border-poli-navy outline-none bg-white text-poli-body placeholder:text-poli-muted"
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poli-muted" />
              <input
                id="signup-email"
                type="email"
                placeholder="you@example.com"
                value={signUpEmail}
                onChange={(e) => setSignUpEmail(e.target.value)}
                required
                className="border border-poli-surface/80 rounded-xl h-12 px-4 pl-10 w-full text-sm focus:ring-1 focus:ring-poli-navy focus:border-poli-navy outline-none bg-white text-poli-body placeholder:text-poli-muted"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-poli-muted" />
              <input
                id="signup-password"
                type="password"
                placeholder="••••••••"
                value={signUpPassword}
                onChange={(e) => setSignUpPassword(e.target.value)}
                required
                className="border border-poli-surface/80 rounded-xl h-12 px-4 pl-10 w-full text-sm focus:ring-1 focus:ring-poli-navy focus:border-poli-navy outline-none bg-white text-poli-body placeholder:text-poli-muted"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{ background: 'linear-gradient(90deg, #182B7A, #B3122F)' }}
              className="w-full h-12 rounded-xl font-bold text-white text-sm hover:opacity-90 disabled:opacity-60"
            >
              {isSubmitting ? 'Creating account...' : 'Create Account →'}
            </button>
          </form>
        )}
      </div>

      {/* Footer links */}
      <p className="text-xs text-poli-muted text-center mt-4">
        <a href="/terms" className="hover:underline">Terms of Service</a>
        {' · '}
        <a href="/privacy" className="hover:underline">Privacy Policy</a>
      </p>
    </main>
  );
};
