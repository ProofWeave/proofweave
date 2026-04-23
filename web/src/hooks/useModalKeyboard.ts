import { useEffect, useCallback, useRef, type RefObject } from 'react';

/**
 * 모달/오버레이에 키보드 네비게이션을 추가하는 훅
 * - ESC: onClose 호출
 * - 방향키 ↑↓: focusable 요소 사이 포커스 이동
 * - Enter: 현재 포커스된 요소 클릭
 */
export function useModalKeyboard({
  open,
  onClose,
  containerRef,
}: {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const focusableSelector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open || !containerRef.current) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const focusables = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(focusableSelector),
        );
        if (focusables.length === 0) return;

        const currentIndex = focusables.indexOf(
          document.activeElement as HTMLElement,
        );

        let nextIndex: number;
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex < focusables.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : focusables.length - 1;
        }

        focusables[nextIndex].focus();
      }

      if (e.key === 'Enter' && document.activeElement !== containerRef.current) {
        // Enter는 기본 동작 허용 (button click 등)
      }
    },
    [open, onClose, containerRef],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  // 모달이 열리면 첫 번째 focusable 요소에 포커스
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const first = containerRef.current.querySelector<HTMLElement>(focusableSelector);
    if (first) {
      setTimeout(() => first.focus(), 50);
    }
  }, [open, containerRef]);
}

/**
 * useRef wrapper for modal keyboard — 간편 사용
 */
export function useModalRef() {
  return useRef<HTMLDivElement>(null);
}
