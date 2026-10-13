import { useLayoutEffect, useRef, useState } from 'react';
import type { TableColumnType } from 'antd';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import type { AuditEvent } from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';
export default function AuditPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(280);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const body = container.querySelector('.ant-table-body');
        if (!body) return;
        const footer = container.querySelector('.vw-grid-footer');
        const footerHeight = footer?.getBoundingClientRect().height ?? 0;
        // Reserve space for the footer and the page's bottom gutter.
        setBodyHeight(Math.max(160, Math.floor(window.innerHeight - body.getBoundingClientRect().top - footerHeight - 24)));
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(frame);
    };
  }, []);

  const columns: TableColumnType<AuditEvent>[] = [
    { title: 'Time', dataIndex: 'timestamp', render: (d: string) => d?.slice(0, 16).replace('T', ' '), sorter: (a, b) => (a.timestamp < b.timestamp ? 1 : -1), defaultSortOrder: 'ascend' },
    { title: 'Entity', dataIndex: 'entityType', render: (t: string) => <VwChip>{t}</VwChip> },
    { title: 'ID', dataIndex: 'entityId' },
    { title: 'Action', dataIndex: 'action' },
    { title: 'Actor', dataIndex: 'actorName' },
    { title: 'Summary', dataIndex: 'summary', ellipsis: true },
  ];
  return (
    <div ref={containerRef}>
      <EntityListPage<AuditEvent> maxBodyHeight={bodyHeight} title="Audit" entityType="auditEvents" columns={columns} searchPlaceholder="Search audit events..." />
    </div>
  );
}
