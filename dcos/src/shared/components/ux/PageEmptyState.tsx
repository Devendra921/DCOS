import type { ReactNode } from 'react';
import { Empty } from 'antd';

/** A missing-record state that fills the content area beneath page breadcrumbs. */
export function PageEmptyState({ title, description, children }: {
  title: ReactNode; description?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="dcos-empty-page">
      <Empty description={
        <div className="dcos-empty-copy">
          <h1 className="vw-card-title">{title}</h1>
          {description && <div className="vw-card-description">{description}</div>}
        </div>
      }>{children}</Empty>
    </div>
  );
}
