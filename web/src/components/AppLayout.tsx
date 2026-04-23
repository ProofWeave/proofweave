import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
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
  const [globalSearch, setGlobalSearch] = useState('');

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : '??';

  const handleGlobalSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && globalSearch.trim()) {
      navigate(`/explorer?q=${encodeURIComponent(globalSearch.trim())}`);
      setGlobalSearch('');
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
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => isActive ? 'active' : ''}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

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
        {/* Global Search Bar */}
        <div className="header-search">
          <Search size={14} />
          <input
            id="global-search-input"
            placeholder="데이터 검색... (Enter)"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            onKeyDown={handleGlobalSearch}
          />
        </div>
        <Outlet />
      </main>

      {/* Overlay for mobile */}
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
    </div>
  );
}
