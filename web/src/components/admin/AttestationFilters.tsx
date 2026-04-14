import type { AdminSearchFilters } from '../../types/admin';

interface Props {
  value: AdminSearchFilters;
  onChange: (next: AdminSearchFilters) => void;
  onSearch: () => void;
  onReset: () => void;
}

export function AttestationFilters({ value, onChange, onSearch, onReset }: Props) {
  const update = (key: keyof AdminSearchFilters, nextValue: string) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <div className="card mb-24">
      <div className="admin-filter-grid">
        <div className="form-group">
          <label className="label">Keyword</label>
          <input
            className="input"
            placeholder="content hash, creator..."
            value={value.q}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="label">Creator</label>
          <input
            className="input"
            placeholder="0x..."
            value={value.creator}
            onChange={(e) => update('creator', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="label">AI Model</label>
          <input
            className="input"
            placeholder="gemini..."
            value={value.aiModel}
            onChange={(e) => update('aiModel', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="label">From</label>
          <input
            className="input"
            type="date"
            value={value.from}
            onChange={(e) => update('from', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="label">To</label>
          <input
            className="input"
            type="date"
            value={value.to}
            onChange={(e) => update('to', e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-8">
        <button className="btn btn-primary" onClick={onSearch}>Search</button>
        <button className="btn btn-secondary" onClick={onReset}>Reset</button>
      </div>
    </div>
  );
}
