/** Lazy wrapper around the form-js viewer (form schemas live in ../lib/forms). */
import { lazy, Suspense } from 'react';
import type { TaskFormProps } from './TaskFormInner';

const Inner = lazy(() => import('./TaskFormInner'));
export type { TaskFormProps } from './TaskFormInner';

export function TaskForm(props: TaskFormProps) {
  return (
    <Suspense fallback={<div className="vw-skeleton vw-skeleton-block" style={{ height: 220, borderRadius: 'var(--vw-radius-md)' }} />}>
      <Inner {...props} />
    </Suspense>
  );
}
