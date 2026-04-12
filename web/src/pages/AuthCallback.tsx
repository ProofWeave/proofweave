import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/** Supabase OAuth 리다이렉트 처리 */
export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        navigate('/', { replace: true });
      }
    });
  }, [navigate]);

  return (
    <div className="auth-container">
      <div className="auth-box text-center">
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <p className="text-secondary">인증 처리 중...</p>
      </div>
    </div>
  );
}
