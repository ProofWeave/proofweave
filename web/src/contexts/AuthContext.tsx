import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  apiKeyReady: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  apiKeyReady: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKeyReady, setApiKeyReady] = useState(false);

  /**
   * Supabase 세션 → 백엔드 /auth/register-web → API Key 발급
   */
  const ensureApiKey = useCallback(async (sess: Session) => {
    // 이미 sessionStorage에 있으면 스킵
    if (api.getApiKey()) {
      setApiKeyReady(true);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/register-web`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sess.access_token}`,
        },
      });

      if (!res.ok) {
        console.warn('[auth] register-web failed:', await res.text());
        return;
      }

      const data = await res.json();
      if (data.apiKey) {
        api.setApiKey(data.apiKey);
        setApiKeyReady(true);
        console.log('[auth] API Key issued for', data.email);
      }
    } catch (err) {
      console.warn('[auth] register-web error:', err);
    }
  }, []);

  useEffect(() => {
    // 초기 세션 가져오기
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);

      if (s) {
        ensureApiKey(s);
      } else if (api.getApiKey()) {
        setApiKeyReady(true);
      }
    });

    // auth 상태 변경 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        // TOKEN_REFRESHED: 토큰만 갱신, user 동일 → 불필요한 re-render 방지
        if (event === 'TOKEN_REFRESHED') {
          setSession(s);
          // user는 변경하지 않음 (동일 사용자)
          return;
        }

        setSession(s);
        setUser(s?.user ?? null);
        setLoading(false);

        if (s && event === 'SIGNED_IN') {
          ensureApiKey(s);
        }

        if (!s) {
          api.clearApiKey();
          setApiKeyReady(false);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [ensureApiKey]);

  const signOut = async () => {
    api.clearApiKey();
    setApiKeyReady(false);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, apiKeyReady }}>
      {children}
    </AuthContext.Provider>
  );
}
