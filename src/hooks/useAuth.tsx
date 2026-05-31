/**
 * AuthProvider + useAuth hook.
 *
 * Maintains the Supabase session in React context so every screen can access
 * the current user without re-subscribing to onAuthStateChange individually.
 *
 * Wrap the app tree with <AuthProvider> in _layout.tsx, then call useAuth()
 * in any screen or hook that needs the session.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { signOut as authSignOut } from '@/services/auth';

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** Current Supabase session. Null when signed out or during initial load. */
  session: Session | null;
  /** Convenience alias for session?.user ?? null. */
  user: User | null;
  /**
   * True only during the initial session hydration on app launch.
   * Screens should block rendering until this is false.
   */
  isLoading: boolean;
  /** Signs out the current user. Session clears via onAuthStateChange. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('[RoadPing] auth provider mounted');
    // Hydrate session from AsyncStorage on first mount.
    // The Supabase client with AsyncStorage persistence restores the persisted
    // JWT automatically; getSession() returns it synchronously from cache.
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    // Subscribe to future auth events: sign-in, sign-out, token refresh,
    // email confirmation, password recovery, etc.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function signOut(): Promise<void> {
    await authSignOut();
    // onAuthStateChange fires immediately → session → null → screens redirect.
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    isLoading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the current auth context value.
 * @throws {Error} if called outside an <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return ctx;
}
