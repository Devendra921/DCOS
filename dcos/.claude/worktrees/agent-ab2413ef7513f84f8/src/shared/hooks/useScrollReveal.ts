import { useState, useCallback } from 'react';

/**
 * Reveals `rows` incrementally (pageSize at a time) as the user scrolls near
 * the bottom, replacing antd's numbered pager. Pass `pagination={false}` on
 * the `<Table>`, render `dataSource={visible}`, and mount a sentinel div with
 * `ref={sentinelRef}` right after it (only while `hasMore`) — see
 * EntityListPage.tsx for the reference usage this was extracted from.
 *
 * `resetKey` — pass whatever search/filter/sort state should collapse the
 * reveal back to the first page when it changes (e.g. a search string).
 * Omit it if the table has no client-side filtering to reset against.
 */
export function useScrollReveal<T>(rows: T[], pageSize = 25, resetKey?: unknown) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [prevResetKey, setPrevResetKey] = useState(resetKey);

  // Standard React "adjust state during render" reset pattern — cheaper than
  // an effect round-trip and avoids a one-frame flash of the stale count.
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setVisibleCount(pageSize);
  }

  const total = rows.length;
  const visible = rows.slice(0, visibleCount);
  const hasMore = visibleCount < total;

  // Callback ref (not a plain useEffect reading a separate ref) so the
  // IntersectionObserver's lifecycle is tied exactly to the sentinel DOM
  // node's own mount/unmount — a `useEffect([hasMore])` reading `ref.current`
  // can run before React has attached the ref for a just-mounted conditional
  // element, silently never creating the observer. See EntityListPage.tsx's
  // history for the actual bug this avoids.
  const sentinelRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            setVisibleCount((c) => Math.min(c + pageSize, rows.length));
          }
        },
        { rootMargin: '300px' },
      );
      observer.observe(el);
      return () => observer.disconnect();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows.length, pageSize],
  );

  return { visible, hasMore, sentinelRef, total, visibleCount };
}

export default useScrollReveal;
