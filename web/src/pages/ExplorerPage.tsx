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

  // Search state — 다중 선택
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [domains, setDomains] = useState<string[]>(() => {
    const d = searchParams.get('domain');
    return d ? d.split(',') : [];
  });
  const [problemTypes, setProblemTypes] = useState<string[]>(() => {
    const p = searchParams.get('problemType');
    return p ? p.split(',') : [];
  });

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

  // 구매 + facets 로드
  useEffect(() => {
    api.get<{ attestationIds: string[] }>('/purchases/mine')
      .then((data) => setPurchasedIds(new Set(data.attestationIds)))
      .catch(() => {});
    api.get<Facets>('/search/facets')
      .then((data) => setFacets(data))
      .catch(() => {});
  }, []);

  // 페이지 진입 시 자동 검색
  useEffect(() => {
    handleSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL 파라미터 변경 감지 (글로벌 검색바에서 이동 시)
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ && urlQ !== query) {
      setQuery(urlQ);
      setTimeout(() => handleSearch(1, urlQ), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleModalClose = () => {
    setSelectedId(null);
    api.get<{ attestationIds: string[] }>('/purchases/mine')
      .then((data) => setPurchasedIds(new Set(data.attestationIds)))
      .catch(() => {});
  };

  const handleSearch = async (p = 1, overrideQuery?: string) => {
    setLoading(true);
    setError(null);
    try {
      const limit = 20;
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String((p - 1) * limit),
      });

      const searchQ = overrideQuery ?? query;
      if (searchQ.trim()) params.set('q', searchQ.trim());
      // 다중 필터: 쉼표로 구분하여 전송 (API에서 첫 번째만 사용하지만 확장 가능)
      if (domains.length === 1) params.set('domain', domains[0]);
      if (problemTypes.length === 1) params.set('problemType', problemTypes[0]);
      // 다중 선택 시 클라이언트에서 추가 필터링 (향후 API 확장 시 대체)

      const data = await api.get<SearchResult>(`/search?${params}`);
      let filtered = data.attestations || [];

      // 다중 도메인/유형 필터: 클라이언트에서 추가 필터링
      if (domains.length > 1) {
        filtered = filtered.filter((a) => a.metadata?.domain && domains.includes(a.metadata.domain));
      }
      if (problemTypes.length > 1) {
        filtered = filtered.filter((a) => a.metadata?.problemType && problemTypes.includes(a.metadata.problemType));
      }

      setResults(filtered);
      setTotalCount(data.totalCount ?? data.count);
      setPage(p);
      setSearched(true);

      // URL 동기화
      const newParams = new URLSearchParams();
      if (searchQ.trim()) newParams.set('q', searchQ.trim());
      if (domains.length > 0) newParams.set('domain', domains.join(','));
      if (problemTypes.length > 0) newParams.set('problemType', problemTypes.join(','));
      setSearchParams(newParams, { replace: true });

      // facets 새로고침
      api.get<Facets>('/search/facets')
        .then((data) => setFacets(data))
        .catch(() => {});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // 토글 함수
  const toggleDomain = (value: string) => {
    setDomains((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  };
  const toggleProblemType = (value: string) => {
    setProblemTypes((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]
    );
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setSelectedAtt(results.find((r) => r.attestationId === id));
  };

  const removeFilter = (type: 'domain' | 'problemType', value: string) => {
    if (type === 'domain') setDomains((prev) => prev.filter((d) => d !== value));
    else setProblemTypes((prev) => prev.filter((p) => p !== value));
  };

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

  const hasActiveFilters = domains.length > 0 || problemTypes.length > 0;

  return (
    <>
      <div className="page-header">
        <h2>Explorer</h2>
        <p>등록된 AI 데이터 탐색 및 구매</p>
      </div>

      {/* Search + Filters */}
      <div className="card mb-24">
        <form
          className="flex gap-12"
          onSubmit={(e) => { e.preventDefault(); handleSearch(1); }}
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
          <button className="btn btn-primary" type="submit" disabled={loading}>
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

          {/* Active filter badges */}
          {hasActiveFilters && (
            <div className="filter-bar__tags">
              {domains.map((d) => (
                <span key={d} className="badge badge-purple" style={{ cursor: 'pointer' }}
                  onClick={() => removeFilter('domain', d)}>
                  {d} <X size={10} />
                </span>
              ))}
              {problemTypes.map((p) => (
                <span key={p} className="badge badge-info" style={{ cursor: 'pointer' }}
                  onClick={() => removeFilter('problemType', p)}>
                  {p} <X size={10} />
                </span>
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
                        <td className="text-xs">{formatDate(att.createdAt)}</td>
                        <td>
                          <div className="flex gap-4">
                            <span className="badge badge-success">confirmed</span>
                            {isPurchased && (
                              <span className="badge" style={{
                                background: 'rgba(139, 92, 246, 0.15)',
                                color: 'var(--accent-purple)',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                              }}>
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
                            <a
                              href={`https://sepolia.basescan.org/tx/${att.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary btn-sm"
                              style={{ textDecoration: 'none' }}
                            >
                              <ExternalLink size={14} /> Tx
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center text-muted" style={{ padding: '60px' }}>
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
              onClick={() => handleSearch(page - 1)}>
              <ChevronLeft size={14} /> 이전
            </button>
            <button className="btn btn-secondary btn-sm" disabled={page * 20 >= totalCount}
              onClick={() => handleSearch(page + 1)}>
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
        onClear={() => setDomains([])}
        onClose={() => setFilterModal(null)}
      />
      <FilterPickerModal
        open={filterModal === 'problemType'}
        title="유형 선택"
        options={facets.problemTypes}
        selected={problemTypes}
        onToggle={toggleProblemType}
        onClear={() => setProblemTypes([])}
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
