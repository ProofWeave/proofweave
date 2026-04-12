import { useState } from 'react';
import { Search as SearchIcon, ExternalLink, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { api } from '../lib/api';

interface Attestation {
  id: number;
  content_hash: string;
  creator: string;
  model_id: string;
  created_at: string;
  status: string;
  tx_hash: string;
}

interface SearchResult {
  attestations: Attestation[];
  page: number;
  limit: number;
}

export function ExplorerPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Attestation[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (query.trim()) params.set('q', query.trim());

      const data = await api.get<SearchResult>(`/attestations/search?${params}`);
      setResults(data.attestations || []);
      setPage(p);
      setSearched(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const truncateHash = (hash: string) =>
    hash.length > 14 ? `${hash.slice(0, 8)}...${hash.slice(-6)}` : hash;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Explorer</h2>
        <p>등록된 AI 데이터 탐색 및 구매</p>
      </div>

      <div className="card mb-24">
        <form
          className="flex gap-12"
          onSubmit={(e) => { e.preventDefault(); handleSearch(1); }}
        >
          <div style={{ flex: 1, position: 'relative' }}>
            <SearchIcon
              size={16}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              className="input"
              style={{ paddingLeft: 38 }}
              placeholder="Content hash, creator address, 또는 키워드로 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : '검색'}
          </button>
        </form>
      </div>

      {error && (
        <div className="card mb-24" style={{ borderColor: 'var(--accent-red)' }}>
          <p className="text-sm" style={{ color: 'var(--accent-red)' }}>{error}</p>
        </div>
      )}

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Content Hash</th>
                <th>Creator</th>
                <th>Model</th>
                <th>Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {results.length > 0 ? (
                results.map((att) => (
                  <tr key={att.id}>
                    <td className="mono">{att.id}</td>
                    <td className="mono" title={att.content_hash}>
                      {truncateHash(att.content_hash || '—')}
                    </td>
                    <td className="mono" title={att.creator}>
                      {truncateHash(att.creator || '—')}
                    </td>
                    <td>
                      <span className="badge badge-purple">
                        {att.model_id || '—'}
                      </span>
                    </td>
                    <td className="text-xs">{formatDate(att.created_at)}</td>
                    <td>
                      <span className={`badge ${att.status === 'confirmed' ? 'badge-success' : 'badge-warning'}`}>
                        {att.status || 'pending'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm">
                        <Eye size={14} /> 보기
                      </button>
                    </td>
                  </tr>
                ))
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

        {/* Pagination */}
        {results.length > 0 && (
          <div className="flex items-center justify-between mt-16">
            <span className="text-xs text-muted">
              페이지 {page} · {results.length}건 표시
            </span>
            <div className="flex gap-8">
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => handleSearch(page - 1)}
              >
                <ChevronLeft size={14} /> 이전
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={results.length < 20}
                onClick={() => handleSearch(page + 1)}
              >
                다음 <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 하단 Tx 탐색기 링크 */}
      {results.length > 0 && (
        <div className="mt-16 text-center">
          <a
            href="https://sepolia.basescan.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs flex items-center gap-8 justify-center"
            style={{ color: 'var(--text-muted)' }}
          >
            <ExternalLink size={12} />
            Base Sepolia Explorer에서 트랜잭션 확인
          </a>
        </div>
      )}
    </>
  );
}
