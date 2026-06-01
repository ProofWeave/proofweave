import { useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { AuthContext } from './auth-core';

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
        // INITIAL_SESSION: getSession()과 중복 — 무시
        if (event === 'INITIAL_SESSION') return;

        setSession(s);

        // 명시적 로그아웃에서만 user를 비운다.
        if (event === 'SIGNED_OUT') {
          setUser(null);
          api.clearApiKey();
          setApiKeyReady(false);
          return;
        }

        // TOKEN_REFRESHED · SIGNED_IN 재방출(탭 refocus) · USER_UPDATED 등:
        // 동일 사용자면 이전 user 참조를 그대로 유지해 불필요한 re-render와
        // /landing 으로의 튕김을 막는다. 세션이 일시적으로 비어도(로그아웃 아님)
        // user 는 건드리지 않는다.
        if (s?.user) {
          const nextUser = s.user;
          setUser((prev) => (prev && prev.id === nextUser.id ? prev : nextUser));
          if (event === 'SIGNED_IN') ensureApiKey(s);
        }
      },
    );

    // in-page 401(키 만료/revoke) → 로그아웃/landing 이동 없이 현재 세션으로 키만 재발급
    api.setOnUnauthorized(() => {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (s) ensureApiKey(s);
      });
    });

    return () => {
      api.setOnUnauthorized(null);
      subscription.unsubscribe();
    };
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
