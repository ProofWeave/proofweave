import { X } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

interface FacetOption {
  value: string;
  count: number;
}

interface FilterPickerModalProps {
  open: boolean;
  title: string;
  options: FacetOption[];
  selected: string[];        // 다중 선택
  onToggle: (value: string) => void;  // 토글 방식
  onClear: () => void;
  onClose: () => void;
}

// ── Component ───────────────────────────────────────────────

export function FilterPickerModal({
  open,
  title,
  options,
  selected,
  onToggle,
  onClear,
  onClose,
}: FilterPickerModalProps) {
  if (!open) return null;

  const selectedCount = selected.length;

  return (
    <div className="filter-modal-overlay" onClick={onClose}>
      <div className="filter-modal" onClick={(e) => e.stopPropagation()}>
        <div className="filter-modal__header">
          <h3>
            {title}
            {selectedCount > 0 && (
              <span className="filter-modal__selected-count">{selectedCount}개 선택됨</span>
            )}
          </h3>
          <div className="flex gap-8">
            {selectedCount > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={onClear}>
                초기화
              </button>
            )}
            <button className="filter-modal__close" onClick={onClose} aria-label="닫기">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="filter-modal__body">
          {options.length > 0 ? (
            options.map(({ value, count }) => (
              <button
                key={value}
                className={`filter-chip ${selected.includes(value) ? 'filter-chip--active' : ''}`}
                onClick={() => onToggle(value)}
              >
                {value}
                <span className="filter-chip__count">{count}</span>
              </button>
            ))
          ) : (
            <p className="filter-modal__empty">
              아직 메타데이터가 추출된 데이터가 없습니다.<br />
              Attestation을 등록하면 자동으로 채워집니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
