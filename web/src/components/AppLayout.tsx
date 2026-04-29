import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isAdminWhitelisted } from '../config/adminWhitelist';
import {
  LayoutDashboard,
  FileCheck,
  Search,
  BarChart3,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  Command,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/attest', icon: FileCheck, label: 'Attest' },
  { to: '/explorer', icon: Search, label: 'Explorer' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/admin', icon: ShieldCheck, label: 'Admin Audit' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const canAccessAdmin = isAdminWhitelisted(user);

  // ── Cmd+K Search Modal ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : '??';

  // ── Global keyboard shortcut: Cmd+K / Ctrl+K ──
  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setSearchOpen((prev) => !prev);
    }
    if (e.key === 'Escape') {
      setSearchOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  // Focus input when modal opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [searchOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/explorer?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <div className="app-layout">
      {/* Mobile menu toggle */}
      <button
        className="mobile-menu-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <h1>ProofWeave</h1>
          <span>AI Data Attestation</span>
        </div>

        <nav className="sidebar-nav" role="navigation" aria-label="Main">
          {NAV_ITEMS
            .filter((item) => (item.to === '/admin' ? canAccessAdmin : true))
            .map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              className={({ isActive }) => isActive ? 'active' : ''}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={18} />
              {label}
            </NavLink>
            ))}
        </nav>

        {/* Cmd+K shortcut hint */}
        <button
          className="cmdk-sidebar-hint"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={14} />
          <span>검색</span>
          <kbd><Command size={10} />K</kbd>
        </button>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar" role="img" aria-label={user?.email || 'User'}>
            {initials}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">
              {user?.email?.split('@')[0] || 'User'}
            </div>
            <div className="sidebar-user-email">
              {user?.email || ''}
            </div>
          </div>
          <button
            onClick={signOut}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            title="로그아웃"
            aria-label="로그아웃"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="app-main" role="main">
        <Outlet />
      </main>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 99,
          }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Cmd+K Search Modal ── */}
      {searchOpen && (
        <div
          className="cmdk-overlay"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="cmdk-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSearchSubmit}>
              <div className="cmdk-input-row">
                <Search size={18} className="cmdk-input-icon" />
                <input
                  ref={searchInputRef}
                  className="cmdk-input"
                  placeholder="키워드, 해시, 주소로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                />
                <kbd className="cmdk-esc">ESC</kbd>
              </div>
            </form>

            {/* Quick navigation */}
            <div className="cmdk-section">
              <div className="cmdk-section-title">빠른 이동</div>
              {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
                <button
                  key={to}
                  className="cmdk-item"
                  onClick={() => {
                    navigate(to);
                    setSearchOpen(false);
                  }}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
