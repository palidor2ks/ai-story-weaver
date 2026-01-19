import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isReconnecting: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MAX_AUTH_RETRIES = 3;
const AUTH_RETRY_DELAY_MS = 2000;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const loadingResolved = useRef(false);
  const lastKnownSession = useRef<Session | null>(null);

  useEffect(() => {
    let retryCount = 0;
    let retryTimeout: NodeJS.Timeout | null = null;

    const attemptGetSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }
        
        // Success - update state
        setSession(session);
        setUser(session?.user ?? null);
        lastKnownSession.current = session;
        setIsReconnecting(false);
        retryCount = 0;
        
        if (!loadingResolved.current) {
          loadingResolved.current = true;
          setLoading(false);
        }
      } catch (err: any) {
        console.error('[Auth] getSession error:', err.message);
        
        // Check if it's a transient error (504, network, etc.)
        const isTransient = 
          err.message?.includes('504') ||
          err.message?.includes('fetch') ||
          err.message?.includes('network') ||
          err.message?.includes('timeout') ||
          err.status === 504 ||
          err.status === 503;
        
        if (isTransient && retryCount < MAX_AUTH_RETRIES) {
          retryCount++;
          setIsReconnecting(true);
          
          // Keep the last known session during reconnection attempts
          if (lastKnownSession.current) {
            setSession(lastKnownSession.current);
            setUser(lastKnownSession.current.user);
          }
          
          console.log(`[Auth] Retry ${retryCount}/${MAX_AUTH_RETRIES} in ${AUTH_RETRY_DELAY_MS}ms`);
          
          retryTimeout = setTimeout(() => {
            attemptGetSession();
          }, AUTH_RETRY_DELAY_MS * retryCount);
        } else {
          // Give up - clear session
          setSession(null);
          setUser(null);
          setIsReconnecting(false);
          
          if (!loadingResolved.current) {
            loadingResolved.current = true;
            setLoading(false);
          }
          
          if (retryCount >= MAX_AUTH_RETRIES) {
            toast.error('Unable to connect to authentication service. Please refresh the page.');
          }
        }
      }
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // Only update if we're not in a reconnecting state with a valid last session
        if (!isReconnecting || !lastKnownSession.current) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          lastKnownSession.current = newSession;
        }
        
        if (!loadingResolved.current) {
          loadingResolved.current = true;
          setLoading(false);
        }

        // Handle specific auth events
        if (event === 'TOKEN_REFRESHED') {
          lastKnownSession.current = newSession;
          setIsReconnecting(false);
        } else if (event === 'SIGNED_OUT') {
          lastKnownSession.current = null;
          setIsReconnecting(false);
        }
      }
    );

    // THEN check for existing session with retry logic
    attemptGetSession();

    return () => {
      subscription.unsubscribe();
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { name }
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    lastKnownSession.current = null;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isReconnecting, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // In development, this can happen during HMR - provide a fallback
    if (import.meta.env.DEV) {
      console.warn('[Auth] useAuth called outside provider - this may be an HMR issue, refresh the page');
      return {
        user: null,
        session: null,
        loading: true,
        isReconnecting: false,
        signUp: async () => ({ error: new Error('Auth not ready') }),
        signIn: async () => ({ error: new Error('Auth not ready') }),
        signOut: async () => {},
      };
    }
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
