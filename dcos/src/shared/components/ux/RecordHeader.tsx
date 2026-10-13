import type { ReactNode } from 'react';

/** A record's identity and actions share the same responsive page-header layout. */
export function RecordHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="record-header">
      <div className="record-header-identity">
        <h1 className="vw-page-title">{title}</h1>
        {meta && <div className="record-header-meta">{meta}</div>}
      </div>
      {actions && <div className="record-header-actions">{actions}</div>}
    </header>
  );
}
