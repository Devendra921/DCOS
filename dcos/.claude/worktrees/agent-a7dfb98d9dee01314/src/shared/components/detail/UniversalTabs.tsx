/**
 * UniversalTabs — canonical, entity-agnostic detail-page tab bodies.
 *
 * Addresses restructuring.md §6.6: the "Audit Trail" tab appears on 14 detail
 * pages, "Documents" on 11, "History / Activity" on 8 — each hand-rolled with
 * ~40-60 LOC of near-identical markup. These three components let every detail
 * page compose the SAME parts:
 *
 *   import { AuditTrailTab, ActivityLogTab, DocumentsTab } from '@/shared/components/detail';
 *
 *   { key: 'audit', label: 'Audit Trail',
 *     children: <AuditTrailTab entityId={hub.id} entityType="hubSites" refreshKey={tick} /> }
 *
 *   { key: 'documents', label: 'Documents',
 *     children: <DocumentsTab documents={docs} onUpload={openUpload} /> }
 *
 * AuditTrailTab / ActivityLogTab self-fetch from the shared audit log and
 * subscribe to live changes. DocumentsTab is presentational — feed it any
 * document list.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Timeline, Typography, Tooltip } from 'antd';
import { VwTable as Table } from '../vw/VwTable';
import { VwButton as Button } from '../vw/VwButton';

import {
  FileTextOutlined,
  DownloadOutlined,
  EyeOutlined,
  UploadOutlined,
  ClockCircleOutlined,
} from '../../icons';
import { getAuditEntries, subscribeAudit } from '../../../mock/db/auditLog';
import type { AuditEntry } from '../../../mock/db/auditLog';
import { UX, EmptyState, VwChip } from '../ux';

const { Text } = Typography;

// ─── relative-time helper ───────────────────────────────────────────
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ════════════════════════════════════════════════════════════════════
// Entity history (core) — powers both Audit Trail and Activity tabs
// ════════════════════════════════════════════════════════════════════

export interface EntityHistoryTabProps {
  /** Entity primary key — audit entries are filtered to this id. */
  entityId: string;
  /** Optional entity-type filter (e.g. 'hubSites', 'leases'). */
  entityType?: string;
  /** Cap the number of entries shown (default 100). */
  limit?: number;
  /** Bump this to force a refetch after a local mutation. */
  refreshKey?: number;
  /** Heading shown above the timeline. */
  title?: string;
  /** Noun used in the empty state. */
  emptyText?: string;
}

function EntityHistoryTab({
  entityId,
  entityType,
  limit = 100,
  refreshKey = 0,
  title,
  emptyText,
}: EntityHistoryTabProps) {
  const [liveTick, setLiveTick] = useState(0);

  // Live updates — re-render when the shared audit log changes.
  useEffect(() => subscribeAudit(() => setLiveTick((t) => t + 1)), []);

  const entries = useMemo<AuditEntry[]>(
    () => getAuditEntries({ entityId, entityType, limit }),
    [entityId, entityType, limit, refreshKey, liveTick],
  );

  if (entries.length === 0) {
    return <EmptyState variant="no-data" entity={emptyText ?? 'history'} />;
  }

  return (
    <div>
      {title && (
        <div style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 600, color: UX.slate, marginBottom: 14 }}>
          {title} · {entries.length}
        </div>
      )}
      <Timeline
        items={entries.map((e) => ({
          dot: <ClockCircleOutlined style={{ fontSize: "var(--vw-font-label-sm)", color: UX.muted }} />,
          children: (
            <div>
              <div style={{ display: 'flex', gap: "var(--vw-space-sm)", alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Text strong style={{ fontSize: "var(--vw-font-label-md)", color: UX.slate }}>{e.action}</Text>
                {e.entityType && e.entityType !== 'unknown' && (
                  <VwChip style={{ margin: 0, fontSize: "var(--vw-font-label-xs)" }}>{e.entityType}</VwChip>
                )}
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>{e.userName}</Text>
                <Tooltip title={new Date(e.timestamp).toLocaleString()}>
                  <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>· {relativeTime(e.timestamp)}</Text>
                </Tooltip>
              </div>
              {e.comments && (
                <div style={{ fontSize: "var(--vw-font-label-sm)", color: UX.muted, marginTop: 2 }}>{e.comments}</div>
              )}
              {e.changes && Object.keys(e.changes).length > 0 && (
                <div style={{ marginTop: "var(--vw-space-xxs)", display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(e.changes).slice(0, 6).map(([k, v]) => (
                    <span
                      key={k}
                      style={{
                        fontSize: "var(--vw-font-label-xs)",
                        background: "var(--vw-color-slate-100)",
                        borderRadius: "var(--vw-radius-xs)",
                        padding: '1px 6px',
                        color: UX.muted,
                      }}
                    >
                      {k}: <strong style={{ color: UX.slate }}>{String(v)}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ),
        }))}
      />
    </div>
  );
}

/**
 * AuditTrailTab — canonical "Audit Trail" tab body. System-event framing.
 * Drop into any detail page's tab list. Self-fetching + live.
 */
export function AuditTrailTab({ title, emptyText, ...rest }: EntityHistoryTabProps) {
  return <EntityHistoryTab title={title ?? 'Audit Trail'} emptyText={emptyText ?? 'audit entries'} {...rest} />;
}

/**
 * ActivityLogTab — canonical "Activity" tab body. Per restructuring.md §6.6
 * this REPLACES the inconsistent "History" + "Activity" tab pair with one
 * name. Same data source as AuditTrailTab, activity-framed.
 */
export function ActivityLogTab({ title, emptyText, ...rest }: EntityHistoryTabProps) {
  return <EntityHistoryTab title={title ?? 'Activity'} emptyText={emptyText ?? 'activity'} {...rest} />;
}

// ════════════════════════════════════════════════════════════════════
// Documents tab
// ════════════════════════════════════════════════════════════════════

export interface DetailDocument {
  id: string;
  name: string;
  category?: string;
  sizeLabel?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  url?: string;
}

export interface DocumentsTabProps {
  /** Document list to render. */
  documents: DetailDocument[];
  /** Upload affordance — shown as a header button + empty-state CTA. */
  onUpload?: () => void;
  /** View handler (per row). */
  onView?: (doc: DetailDocument) => void;
  /** Download handler (per row). */
  onDownload?: (doc: DetailDocument) => void;
  /** Heading (default "Documents"). */
  title?: string;
}

/**
 * DocumentsTab — canonical "Documents" tab body. Presentational: feed it any
 * document list shaped as DetailDocument[]. Used to replace the 11 hand-rolled
 * Documents tabs across detail pages.
 */
export function DocumentsTab({ documents, onUpload, onView, onDownload, title }: DocumentsTabProps) {
  if (documents.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        entity="documents"
        primaryAction={onUpload ? { label: 'Upload document', onClick: onUpload } : undefined}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-md)" }}>
        <div style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 600, color: UX.slate }}>
          {title ?? 'Documents'} · {documents.length}
        </div>
        {onUpload && (
          <Button size="small" icon={<UploadOutlined />} onClick={onUpload}>
            Upload
          </Button>
        )}
      </div>
      <Table<DetailDocument>
        dataSource={documents}
        rowKey="id"
        size="small"
        pagination={documents.length > 12 ? { pageSize: 12 } : false}
        scroll={{ x: 'max-content' }}
        columns={[
          {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (v: string) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FileTextOutlined style={{ color: UX.muted }} />
                <Text style={{ fontSize: "var(--vw-font-label-md)" }}>{v}</Text>
              </span>
            ),
          },
          {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
            render: (v?: string) => (v ? <VwChip>{v}</VwChip> : <Text type="secondary">—</Text>),
          },
          {
            title: 'Size',
            dataIndex: 'sizeLabel',
            key: 'size',
            render: (v?: string) => <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{v ?? '—'}</Text>,
          },
          {
            title: 'Uploaded',
            dataIndex: 'uploadedAt',
            key: 'uploadedAt',
            render: (v?: string) => (
              <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{v ? relativeTime(v) : '—'}</Text>
            ),
          },
          {
            title: 'By',
            dataIndex: 'uploadedBy',
            key: 'uploadedBy',
            render: (v?: string) => <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{v ?? '—'}</Text>,
          },
          {
            title: '',
            key: 'actions',
            width: 84,
            render: (_v: unknown, doc: DetailDocument) => (
              <span style={{ display: 'inline-flex', gap: 2 }}>
                <Tooltip title="View">
                  <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => onView?.(doc)} />
                </Tooltip>
                <Tooltip title="Download">
                  <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => onDownload?.(doc)} />
                </Tooltip>
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
