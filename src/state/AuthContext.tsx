import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '@/services';
import type { AuthSession } from '@/services';

interface AuthState {
  loading: boolean;
  session: AuthSession | null;
  userId: string | null;
}

const AuthContext = createContext<AuthState>({ loading: true, session: null, userId: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, session: null, userId: null });

  useEffect(() => {
    let mounted = true;

    // Restore any persisted session on launch.
    auth.getSession()
      .then((session) => {
        if (mounted) {
          setState({ loading: false, session, userId: session?.user.id ?? null });
        }
      })
      .catch(() => {
        if (mounted) setState({ loading: false, session: null, userId: null });
      });

    // React to sign-in / sign-out / token refresh.
    const unsubscribe = auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setState({ loading: false, session, userId: session?.user.id ?? null });
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
