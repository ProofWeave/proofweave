import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search as SearchIcon,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileSearch,
  ShoppingBag,
  LayoutGrid,
  List,
  Filter,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { basescanTxUrl, isEvmTxHash } from '../lib/tx';
import { AttestationPurchaseModal } from '../components/AttestationPurchaseModal';
import { AttestationCard, type AttestationWithMetadata } from '../components/AttestationCard';
import { FilterPickerModal } from '../components/FilterPickerModal';

// ── Types ────────────────────────────────────────────────────

interface SearchResult {
  count: number;
  totalCount: number;
  attestations: AttestationWithMetadata[];
}

interface FacetOption {
  value: string;
  count: number;
}

interface Facets {
  domains: FacetOption[];
  problemTypes: FacetOption[];
}

// ── Component ───────────────────────────────────────────────

export function ExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Search state — 다중 선택. URL이 단일 소스(query/domain/problemType/price/creator).
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const domains = (searchParams.get('domain') || '').split(',').filter(Boolean);
  const problemTypes = (searchParams.get('problemType') || '').split(',').filter(Boolean);
  const priceFilter = (searchParams.get('price') as 'all' | 'free' | 'paid') || 'all';
  const creatorFilter = searchParams.get('creator') || '';

  // Results
  const [results, setResults] = useState<AttestationWithMetadata[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // View & modals
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAtt, setSelectedAtt] = useState<AttestationWithMetadata | undefined>(undefined);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());

  // Dynamic facets
  const [facets, setFacets] = useState<Facets>({ domains: [], problemTypes: [] });
  const [filterModal, setFilterModal] = useState<'domain' | 'problemType' | null>(null);

  const loadPurchases = () =>
    api.get<{ attestationIds: string[] }>('/purchases/mine')
      .then((data) => setPurchasedIds(new Set(data.attestationIds)))
      .catch(() => {});

  // 구매 + facets 로드 (1회)
  useEffect(() => {
    loadPurchases();
    api.get<Facets>('/search/facets').then(setFacets).catch(() => {});
  }, []);

  // 단일 검색 effect: URL 파라미터(필터/검색어)가 바뀔 때마다 page 1로 서버 검색.
  // 이전의 mount effect + searchParams effect 두 개가 일으키던 중복 호출/churn 제거.
  const filterKey = searchParams.toString();
  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const handleModalClose = () => {
    setSelectedId(null);
    loadPurchases();
  };

  // 필터/검색어를 URL에 commit → 위 effect가 검색 실행 (단일 진실 소스)
  const commitParams = (mut: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    mut(next);
    setSearchParams(next, { replace: true });
  };

  // 서버 검색 — 모든 필터(멀티 도메인/유형/가격/creator)를 server-side로 전송
  const runSearch = async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const limit = 20;
      const params = new URLSearchParams({ limit: String(limit), offset: String((p - 1) * limit) });
      const q = searchParams.get('q')?.trim();
      if (q) params.set('q', q);
      if (domains.length) params.set('domain', domains.join(','));
      if (problemTypes.length) params.set('problemType', problemTypes.join(','));
      if (priceFilter !== 'all') params.set('price', priceFilter);
      if (creatorFilter) params.set('creator', creatorFilter);

      const data = await api.get<SearchResult>(`/search?${params}`);
      setResults(data.attestations || []);
      setTotalCount(data.totalCount ?? data.count);
      setPage(p);
      setSearched(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const submitQuery = () => commitParams((p) => {
    const t = query.trim();
    if (t) p.set('q', t); else p.delete('q');
  });

  // 토글/설정 함수 — 모두 URL에 commit (effect가 검색 실행)
  const setListParam = (key: 'domain' | 'problemType', list: string[]) =>
    commitParams((p) => { if (list.length) p.set(key, list.join(',')); else p.delete(key); });
  const toggleDomain = (value: string) =>
    setListParam('domain', domains.includes(value) ? domains.filter((d) => d !== value) : [...domains, value]);
  const toggleProblemType = (value: string) =>
    setListParam('problemType', problemTypes.includes(value) ? problemTypes.filter((p) => p !== value) : [...problemTypes, value]);
  const setPriceFilter = (v: 'all' | 'free' | 'paid') =>
    commitParams((p) => { if (v === 'all') p.delete('price'); else p.set('price', v); });

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setSelectedAtt(results.find((r) => r.attestationId === id));
  };

  const removeFilter = (type: 'domain' | 'problemType', value: string) => {
    if (type === 'domain') setListParam('domain', domains.filter((d) => d !== value));
    else setListParam('problemType', problemTypes.filter((p) => p !== value));
  };

  const clearCreator = () => commitParams((p) => p.delete('creator'));

  const truncateHash = (hash: string) =>
    hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ko-KR', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const hasActiveFilters = domains.length > 0 || problemTypes.length > 0 || priceFilter !== 'all' || !!creatorFilter;
  const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

  return (
    <>
      <div className="page-header">
        <h2>Explorer</h2>
        <p>등록된 AI 데이터 탐색 및 구매</p>
      </div>

      {/* Search + Filters */}
      <div className="card mb-24">
        <form
          className="flex gap-8"
          onSubmit={(e) => { e.preventDefault(); submitQuery(); }}
        >
          <div style={{ flex: 1, position: 'relative' }}>
            <SearchIcon
              size={16}
              style={{
                position: 'absolute', left: 14, top: '50%',
                transform: 'translateY(-50%)', color: 'var(--text-muted)',
              }}
            />
            <input
              id="explorer-search-input"
              className="input"
              style={{ paddingLeft: 38 }}
              placeholder="키워드, 해시, 주소로 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : '검색'}
          </button>
        </form>

        {/* Filter Bar */}
        <div className="filter-bar">
          <Filter size={14} style={{ color: hasActiveFilters ? 'var(--accent-purple)' : 'var(--text-muted)' }} />

          {/* Domain trigger */}
          <button
            className={`filter-trigger ${domains.length > 0 ? 'filter-trigger--active' : ''}`}
            onClick={() => setFilterModal('domain')}
          >
            도메인{domains.length > 0 && ` (${domains.length})`}
            <ChevronDown size={13} />
          </button>

          {/* ProblemType trigger */}
          <button
            className={`filter-trigger ${problemTypes.length > 0 ? 'filter-trigger--active' : ''}`}
            onClick={() => setFilterModal('problemType')}
          >
            유형{problemTypes.length > 0 && ` (${problemTypes.length})`}
            <ChevronDown size={13} />
          </button>

          {/* Price filter chips */}
          <div className="price-filter">
            <button
              className={`price-filter__chip ${priceFilter === 'all' ? 'price-filter__chip--active' : ''}`}
              onClick={() => setPriceFilter('all')}
            >전체</button>
            <button
              className={`price-filter__chip ${priceFilter === 'free' ? 'price-filter__chip--active' : ''}`}
              onClick={() => setPriceFilter('free')}
            >무료</button>
            <button
              className={`price-filter__chip price-filter__chip--paid ${priceFilter === 'paid' ? 'price-filter__chip--active' : ''}`}
              onClick={() => setPriceFilter('paid')}
            >유료</button>
          </div>

          {/* Active filter badges (click to remove) */}
          {hasActiveFilters && (
            <div className="filter-bar__tags">
              {creatorFilter && (
                <button type="button" className="filter-tag" onClick={clearCreator} title="작성자 필터 제거">
                  작성자 {shortAddr(creatorFilter)} <X size={10} />
                </button>
              )}
              {domains.map((d) => (
                <button type="button" key={d} className="filter-tag" onClick={() => removeFilter('domain', d)}>
                  {d} <X size={10} />
                </button>
              ))}
              {problemTypes.map((p) => (
                <button type="button" key={p} className="filter-tag filter-tag--alt" onClick={() => removeFilter('problemType', p)}>
                  {p} <X size={10} />
                </button>
              ))}
            </div>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* View Toggle */}
          <div className="view-toggle">
            <button
              className={`view-toggle__btn ${viewMode === 'card' ? 'active' : ''}`}
              onClick={() => setViewMode('card')}
              title="카드 뷰" aria-label="카드 뷰"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`view-toggle__btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="테이블 뷰" aria-label="테이블 뷰"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card mb-24" style={{ borderColor: 'var(--accent-red)' }}>
          <p className="text-sm" style={{ color: 'var(--accent-red)' }}>{error}</p>
        </div>
      )}

      {/* Results */}
      {viewMode === 'card' ? (
        results.length > 0 ? (
          <div className="attestation-grid">
            {results.map((att) => (
              <AttestationCard
                key={att.attestationId}
                attestation={att}
                isPurchased={purchasedIds.has(att.attestationId)}
                onSelect={handleSelect}
                onCreatorSelect={(c) => commitParams((p) => p.set('creator', c))}
                onDomainSelect={toggleDomain}
              />
            ))}
          </div>
        ) : (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <p>
                {searched
                  ? '검색 결과가 없습니다.'
                  : '검색어를 입력하거나 빈 검색으로 전체 조회하세요.'}
              </p>
            </div>
          </div>
        )
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Title / ID</th>
                  <th>Domain</th>
                  <th>Model</th>
                  <th>Price</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {results.length > 0 ? (
                  results.map((att) => {
                    const isPurchased = purchasedIds.has(att.attestationId);
                    const meta = att.metadata;
                    const hasTitle = meta?.metadataStatus === 'ready' && meta?.title;
                    const price = att.priceUsdMicros ?? 0;
                    return (
                      <tr key={att.attestationId}>
                        <td title={att.attestationId}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                              {hasTitle ? meta!.title : truncateHash(att.attestationId)}
                            </div>
                            {hasTitle && (
                              <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                                {truncateHash(att.attestationId)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          {meta?.domain ? (
                            <span className="badge badge-purple">{meta.domain}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className="badge badge-purple">{att.aiModel || '—'}</span>
                        </td>
                        <td className="mono text-xs">
                          {price > 0 ? `$${(price / 1_000_000).toFixed(2)}` : <span style={{ color: 'var(--accent-cyan)' }}>무료</span>}
                        </td>
                        <td className="text-xs">{formatDate(att.createdAt)}</td>
                        <td>
                          <div className="flex gap-4">
                            <span className="badge badge-success">confirmed</span>
                            {isPurchased && (
                              <span className="badge badge-purple">
                                <ShoppingBag size={10} style={{ marginRight: 2 }} />
                                구매됨
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex gap-4">
                            <button
                              className={`btn btn-sm ${isPurchased ? 'btn-secondary' : 'btn-primary'}`}
                              onClick={() => handleSelect(att.attestationId)}
                            >
                              <FileSearch size={14} />
                              {isPurchased ? '조회' : '상세'}
                            </button>
                            {isEvmTxHash(att.txHash) && (
                              <a
                                href={basescanTxUrl(att.txHash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary btn-sm"
                                style={{ textDecoration: 'none' }}
                              >
                                <ExternalLink size={14} /> Tx
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center text-muted" style={{ padding: '60px' }}>
                      {searched
                        ? '검색 결과가 없습니다.'
                        : '검색어를 입력하거나 빈 검색으로 전체 조회하세요.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {results.length > 0 && (
        <div className="flex items-center justify-between mt-16">
          <span className="text-xs text-muted">
            전체 {totalCount}건 · 페이지 {page}
          </span>
          <div className="flex gap-8">
            <button className="btn btn-secondary btn-sm" disabled={page <= 1}
              onClick={() => runSearch(page - 1)}>
              <ChevronLeft size={14} /> 이전
            </button>
            <button className="btn btn-secondary btn-sm" disabled={page * 20 >= totalCount}
              onClick={() => runSearch(page + 1)}>
              다음 <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Basescan link */}
      {results.length > 0 && (
        <div className="mt-16 text-center">
          <a href="https://sepolia.basescan.org" target="_blank" rel="noopener noreferrer"
            className="text-xs flex items-center gap-8 justify-center"
            style={{ color: 'var(--text-muted)' }}>
            <ExternalLink size={12} /> Base Sepolia Explorer에서 트랜잭션 확인
          </a>
        </div>
      )}

      {/* Filter Picker Modals — 다중 선택 */}
      <FilterPickerModal
        open={filterModal === 'domain'}
        title="도메인 선택"
        options={facets.domains}
        selected={domains}
        onToggle={toggleDomain}
        onClear={() => setListParam('domain', [])}
        onClose={() => setFilterModal(null)}
      />
      <FilterPickerModal
        open={filterModal === 'problemType'}
        title="유형 선택"
        options={facets.problemTypes}
        selected={problemTypes}
        onToggle={toggleProblemType}
        onClear={() => setListParam('problemType', [])}
        onClose={() => setFilterModal(null)}
      />

      {/* Purchase Modal */}
      <AttestationPurchaseModal
        open={!!selectedId}
        attestationId={selectedId}
        attestation={selectedAtt}
        onClose={handleModalClose}
        alreadyPurchased={selectedId ? purchasedIds.has(selectedId) : false}
      />
    </>
  );
}
