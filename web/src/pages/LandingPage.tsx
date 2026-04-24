import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, Shield, Database, Cpu } from 'lucide-react';

/* ── Organic Blob Loaders (pure CSS animations) ──────────────── */

function BlobMorph({ size, delay, duration, x, y }: {
  size: number; delay: number; duration: number; x: string; y: string;
}) {
  return (
    <div
      className="landing-blob"
      style={{
        width: size,
        height: size,
        left: x,
        top: y,
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
      }}
    />
  );
}

function OrbitDots({ x, y, delay }: { x: string; y: string; delay: number }) {
  return (
    <div className="landing-orbit" style={{ left: x, top: y, animationDelay: `${delay}s` }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="landing-orbit__dot"
          style={{
            transform: `rotate(${i * 72}deg) translateX(20px)`,
            animationDelay: `${delay + i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

function PulseRing({ x, y, delay }: { x: string; y: string; delay: number }) {
  return (
    <div className="landing-pulse-ring" style={{ left: x, top: y, animationDelay: `${delay}s` }}>
      <div className="landing-pulse-ring__inner" />
    </div>
  );
}

function FloatingDot({ x, y, size, delay }: {
  x: string; y: string; size: number; delay: number;
}) {
  return (
    <div
      className="landing-float-dot"
      style={{ left: x, top: y, width: size, height: size, animationDelay: `${delay}s` }}
    />
  );
}

/* ── Landing Page ────────────────────────────────────────────── */

export function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleGetStarted = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="landing">
      {/* ── Floating Organic Elements ── */}
      <div className="landing-canvas" aria-hidden="true">
        <BlobMorph size={120} delay={0} duration={8} x="10%" y="15%" />
        <BlobMorph size={80} delay={1.5} duration={10} x="75%" y="10%" />
        <BlobMorph size={60} delay={3} duration={7} x="85%" y="60%" />
        <BlobMorph size={100} delay={2} duration={9} x="5%" y="70%" />
        <BlobMorph size={50} delay={4} duration={11} x="60%" y="80%" />
        <BlobMorph size={40} delay={0.5} duration={6} x="40%" y="5%" />

        <OrbitDots x="25%" y="30%" delay={0} />
        <OrbitDots x="70%" y="40%" delay={1} />

        <PulseRing x="50%" y="20%" delay={0} />
        <PulseRing x="15%" y="50%" delay={2} />
        <PulseRing x="80%" y="75%" delay={1.5} />

        <FloatingDot x="30%" y="60%" size={12} delay={0} />
        <FloatingDot x="55%" y="45%" size={8} delay={0.8} />
        <FloatingDot x="45%" y="75%" size={10} delay={1.5} />
        <FloatingDot x="20%" y="85%" size={6} delay={2.2} />
        <FloatingDot x="65%" y="25%" size={14} delay={0.3} />
        <FloatingDot x="90%" y="30%" size={7} delay={1.8} />
      </div>

      {/* ── Content ── */}
      <div className="landing-content">
        {/* Logo + Hero */}
        <div className="landing-hero">
          <div className="landing-logo">
            <div className="landing-logo__icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="12" fill="#22181C" />
                <path
                  d="M14 24C14 18.477 18.477 14 24 14V14C29.523 14 34 18.477 34 24V24C34 29.523 29.523 34 24 34V34"
                  stroke="#F6E8EA"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="24" cy="24" r="4" fill="#8B3A4A" />
                <path
                  d="M24 34C18.477 34 14 29.523 14 24"
                  stroke="#8B3A4A"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="4 6"
                />
              </svg>
            </div>
            <h1 className="landing-logo__text">ProofWeave</h1>
          </div>

          <p className="landing-tagline">
            AI 데이터의 진위를 증명하고,<br />
            안전하게 거래하세요.
          </p>

          <p className="landing-description">
            블록체인 기반 데이터 증명 · 암호화 저장 · 탈중앙 마켓플레이스
          </p>

          <button className="landing-cta" onClick={handleGetStarted}>
            {user ? '대시보드로 이동' : '시작하기'}
            <ArrowRight size={18} />
          </button>
        </div>

        {/* Features */}
        <div className="landing-features">
          <div className="landing-feature">
            <div className="landing-feature__icon">
              <Shield size={24} />
            </div>
            <h3>온체인 증명</h3>
            <p>AI 분석 데이터를 블록체인에 변조 불가능하게 기록합니다.</p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">
              <Database size={24} />
            </div>
            <h3>E2E 암호화</h3>
            <p>IPFS에 봉투 암호화로 저장하여 소유자만 접근할 수 있습니다.</p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">
              <Cpu size={24} />
            </div>
            <h3>AI 메타데이터</h3>
            <p>LLM이 자동으로 도메인, 키워드, 요약을 추출합니다.</p>
          </div>
        </div>

        {/* Footer */}
        <footer className="landing-footer">
          <span>Built with Abstract · IPFS · AI</span>
        </footer>
      </div>
    </div>
  );
}
