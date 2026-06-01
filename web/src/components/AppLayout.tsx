import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/auth-core';
import {
  LayoutDashboard,
  FileCheck,
  Search,
  BarChart3,
  Coins,
  Settings,
  ShieldCheck,
  LogOut,
  Command,
  Clock,
  CornerDownLeft,
} from 'lucide-react';

type NavItem = { to: string; icon: typeof LayoutDashboard; label: string };

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/explorer', icon: Search, label: 'Explorer' },
  { to: '/attest', icon: FileCheck, label: 'Attest' },
  { to: '/analytics', icon: BarChart3, label: 'Activity' },
  { to: '/claims', icon: Coins, label: 'Earnings' },
];
const ADMIN_ITEM: NavItem = { to: '/admin', icon: ShieldCheck, label: 'Verification' };
const ALL_NAV: NavItem[] = [...NAV_ITEMS, ADMIN_ITEM, { to: '/settings', icon: Settings, label: 'Settings' }];

const RECENT_KEY = 'pw_recent_searches';
function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, 6) : [];
  } catch {
    return [];
  }
}

type Row =
  | { kind: 'search'; value: string }
  | { kind: 'recent'; value: string }
  | { kind: 'nav'; item: NavItem };

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '??';

  const openSearch = useCallback(() => {
    setRecent(loadRecent());
    setActiveIndex(0);
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((o) => {
          if (o) return false;
          setRecent(loadRecent());
          setActiveIndex(0);
          return true;
        });
      } else if (e.key === 'Escape' && searchOpen) {
        closeSearch();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchOpen, closeSearch]);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [searchOpen]);

  const rows = useMemo<Row[]>(() => {
    const q = searchQuery.trim();
    if (!q) {
      return [
        ...recent.map((value) => ({ kind: 'recent' as const, value })),
        ...ALL_NAV.map((item) => ({ kind: 'nav' as const, item })),
      ];
    }
    const lower = q.toLowerCase();
    const matchedNav = ALL_NAV.filter((i) => i.label.toLowerCase().includes(lower));
    return [{ kind: 'search', value: q }, ...matchedNav.map((item) => ({ kind: 'nav' as const, item }))];
  }, [searchQuery, recent]);

  const clampedIndex = Math.min(Math.max(activeIndex, 0), Math.max(rows.length - 1, 0));

  const runSearch = useCallback(
    (q: string) => {
      const query = q.trim();
      if (!query) return;
      const next = [query, ...loadRecent().filter((x) => x !== query)].slice(0, 6);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      navigate(`/explorer?q=${encodeURIComponent(query)}`);
      closeSearch();
    },
    [navigate, closeSearch],
  );

  const runRow = useCallback(
    (row: Row | undefined) => {
      if (!row) return;
      if (row.kind === 'nav') {
        navigate(row.item.to);
        closeSearch();
      } else if (row.kind === 'recent') {
        setSearchQuery(row.value);
        runSearch(row.value);
      } else {
        runSearch(row.value);
      }
    },
    [navigate, closeSearch, runSearch],
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(Math.min(clampedIndex + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(Math.max(clampedIndex - 1, 0));
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const row = rows[clampedIndex];
    if (row) runRow(row);
    else runSearch(searchQuery);
  };

  return (
    <div className="app-shell">
      {/* ── Floating top navigation ── */}
      <header className="app-topbar">
        <div className="app-topbar__inner">
          <NavLink to="/dashboard" className="topbar-brand">
            <span className="topbar-brand__mark" />
            ProofWeave
          </NavLink>

          <nav className="topnav" aria-label="Main">
            {NAV_ITEMS.map(({ to, label }) => (
              <NavLink key={to} to={to} end={to === '/dashboard'} className={({ isActive }) => (isActive ? 'active' : '')}>
                {label}
              </NavLink>
            ))}
            <NavLink to={ADMIN_ITEM.to} className={({ isActive }) => `topnav__admin ${isActive ? 'active' : ''}`}>
              {ADMIN_ITEM.label}
            </NavLink>
          </nav>

          <div className="app-topbar__actions">
            <button className="topbar-search" onClick={openSearch} title="검색 (⌘K)">
              <Search size={15} />
              <span>검색</span>
              <kbd><Command size={10} />K</kbd>
            </button>
            <button className="topbar-user" onClick={() => navigate('/settings')} title="계정 설정">
              <span className="topbar-user__avatar">{initials}</span>
            </button>
            <button className="topbar-signout" onClick={signOut} title="로그아웃" aria-label="로그아웃">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="app-main" role="main">
        <Outlet />
      </main>

      {/* ── Cmd+K Command Palette ── */}
      {searchOpen && (
        <div className="cmdk-overlay" onClick={closeSearch}>
          <div
            className="cmdk-modal"
            role="dialog"
            aria-modal="true"
            aria-label="검색"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={onSubmit}>
              <div className="cmdk-input-row">
                <Search size={18} className="cmdk-input-icon" />
                <input
                  ref={searchInputRef}
                  className="cmdk-input"
                  placeholder="키워드, 해시, 주소로 검색하거나 페이지로 이동..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  autoComplete="off"
                />
                <kbd className="cmdk-esc">ESC</kbd>
              </div>
            </form>

            <div className="cmdk-list">
              {!searchQuery.trim() && recent.length > 0 && (
                <div className="cmdk-section-title">최근 검색</div>
              )}
              {rows.map((row, idx) => {
                const active = idx === clampedIndex;
                const key = `${row.kind}:${row.kind === 'nav' ? row.item.to : row.value}`;
                if (row.kind === 'nav') {
                  const Icon = row.item.icon;
                  return (
                    <button
                      key={key}
                      className={`cmdk-item ${active ? 'active' : ''}`}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => runRow(row)}
                    >
                      <Icon size={16} />
                      <span>{row.item.label}</span>
                      <span className="cmdk-item__hint">이동</span>
                    </button>
                  );
                }
                return (
                  <button
                    key={key}
                    className={`cmdk-item ${active ? 'active' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => runRow(row)}
                  >
                    {row.kind === 'recent' ? <Clock size={16} /> : <Search size={16} />}
                    <span>{row.kind === 'search' ? `"${row.value}" 검색` : row.value}</span>
                    {active && <CornerDownLeft size={14} className="cmdk-item__enter" />}
                  </button>
                );
              })}
              {searchQuery.trim() && rows.length === 1 && (
                <div className="cmdk-empty">Enter를 눌러 Explorer에서 검색</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
