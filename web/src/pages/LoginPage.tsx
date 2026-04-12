import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, ArrowRight } from 'lucide-react';

type Mode = 'login' | 'signup';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
        });
        if (err) throw err;
        setMessage('가입 완료! 이메일을 확인해주세요.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1 className="auth-title">ProofWeave</h1>
        <p className="auth-subtitle">AI 데이터 증명 마켓플레이스</p>

        {/* Google Login */}
        <button
          className="btn btn-secondary"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 24 }}
          onClick={handleGoogleLogin}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google로 계속하기
        </button>

        <div className="flex items-center gap-12" style={{ margin: '0 0 24px' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
          <span className="text-xs text-muted">또는</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
        </div>

        {/* Email Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label">
              <Mail size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
              이메일
            </label>
            <input
              className="input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="label">
              <Lock size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />
              비밀번호
            </label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <div className="badge badge-error" style={{ display: 'block', marginBottom: 16, padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
              {error}
            </div>
          )}

          {message && (
            <div className="badge badge-success" style={{ display: 'block', marginBottom: 16, padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
              {message}
            </div>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              <>
                {mode === 'login' ? '로그인' : '회원가입'}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-sm mt-24">
          <span className="text-muted">
            {mode === 'login' ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
          </span>
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setError(null);
              setMessage(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-purple)',
              cursor: 'pointer',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              fontSize: '0.85rem',
            }}
          >
            {mode === 'login' ? '회원가입' : '로그인'}
          </button>
        </p>
      </div>
    </div>
  );
}
