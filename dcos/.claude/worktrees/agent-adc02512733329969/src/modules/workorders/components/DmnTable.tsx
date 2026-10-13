/** Lazy wrapper around the dmn-js decision-table viewer. */
import { lazy, Suspense } from 'react';
import type { DmnTableProps } from './DmnTableInner';

const Inner = lazy(() => import('./DmnTableInner'));
export type { DmnTableProps } from './DmnTableInner';

export function DmnTable(props: DmnTableProps) {
  const height = props.height ?? 360;
  return (
    <Suspense fallback={<div className="vw-skeleton vw-skeleton-block" style={{ height, width: '100%', borderRadius: 'var(--vw-radius-md)' }} />}>
      <Inner {...props} />
    </Suspense>
  );
}
