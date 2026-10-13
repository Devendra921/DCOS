import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import type { TableColumnType } from 'antd';
import { Columns3, Download, Inbox, Loader2, Plus, SearchX } from 'lucide-react';
import type { FilterCriteria } from '../../mock/db/store';
import { useEntityList } from '../hooks/useEntityCRUD';
import { Btn, CheckBox, Empty, Modal } from '../../ops/ui/kit';
import { DataTable, type Col } from '../../ops/ui/DataTable';
import { ListToolbar, type ListFilter } from '../../ops/ui/ListToolbar';
import './EntityListPage.css';

// ─── Types ──────────────────────────────────────────────────────────

export interface TabConfig {
  key: string;
  label: string;
  filters?: FilterCriteria[];
}

export interface BulkAction {
  label: string;
  onClick: (selectedRows: any[]) => void;
  danger?: boolean;
}

export interface EntityListPageProps<T extends Record<string, any> = any> {
  title: string;
  entityType: string;
  columns: TableColumnType<T>[];
  createButtonLabel?: string;
  onCreateClick?: () => void;
  onRowClick?: (record: T) => void;
  searchPlaceholder?: string;
  defaultFilters?: FilterCriteria[];
  rowActions?: (record: T) => React.ReactNode;
  bulkActions?: BulkAction[];
  headerExtra?: React.ReactNode;
  /**
   * Optional content rendered between the toolbar and the table.
   * Useful for collapsible filter panels (e.g. Advanced Search).
   */
  subHeader?: React.ReactNode;
  exportEnabled?: boolean;
  tabs?: TabConfig[];
  /**
   * Optional inline data source. When provided, the component bypasses
   * `useEntityList` and uses this array directly. Search and tab-filter
   * are performed client-side.
   */
  dataSource?: T[];
  /**
   * When set, bounds the table body to this height (px) with its own
   * internal scrollbar instead of the default viewport-relative height.
   * Use this whenever EntityListPage is embedded as one section of a
   * bigger composite page (sibling sections above/below).
   */
  maxBodyHeight?: number;
}

type Row<T> = T & { id: string };

// ─── antd column → DataTable column adapter ─────────────────────────

/** The slice of an antd column the adapter reads. */
interface AntCol {
  dataIndex?: unknown;
  key?: React.Key;
  title?: unknown;
  align?: string;
  sorter?: unknown;
  render?: (value: unknown, record: unknown, index: number) => unknown;
}
const asAnt = (col: unknown) => col as AntCol;

const hasDataIndex = (col: AntCol) => col.dataIndex !== undefined && col.dataIndex !== null && col.dataIndex !== '';

const colKey = (col: AntCol, i: number): string => {
  if (Array.isArray(col.dataIndex)) return col.dataIndex.join('.');
  if (hasDataIndex(col)) return String(col.dataIndex);
  if (col.key !== undefined && col.key !== null) return String(col.key);
  return `__col${i}`;
};

const readValue = (record: unknown, col: AntCol): unknown => {
  const di = col.dataIndex;
  const step = (o: unknown, k: unknown) => (o == null ? undefined : (o as Record<string, unknown>)[String(k)]);
  if (Array.isArray(di)) return di.reduce(step, record);
  if (!hasDataIndex(col)) return undefined;
  return step(record, di);
};

const asNode = (v: unknown): React.ReactNode => {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  // antd allows render() to return { children, props } (RenderedCell)
  if (typeof v === 'object' && !React.isValidElement(v) && !Array.isArray(v) && 'children' in v) return (v as { children: React.ReactNode }).children;
  return v as React.ReactNode;
};

const sortValue = (v: unknown): number | string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return String(v).toLowerCase();
};

function toDataTableCols<T>(
  columns: TableColumnType<T>[],
  hidden: Set<string>,
  indexOf: (r: T) => number,
): Col<Row<T>>[] {
  return columns
    .map((col, i) => ({ c: asAnt(col), key: colKey(asAnt(col), i) }))
    .filter(({ key }) => !hidden.has(key))
    .map(({ c, key }) => {
      const header = typeof c.title === 'function' ? (c.title as (p: object) => React.ReactNode)({}) : (c.title as React.ReactNode);
      return {
        key,
        header,
        align: c.align === 'right' ? 'right' : undefined,
        sort: c.sorter && hasDataIndex(c) ? (r: Row<T>) => sortValue(readValue(r, c)) : undefined,
        render: (r: Row<T>) => {
          const value = readValue(r, c);
          return asNode(c.render ? c.render(value, r, indexOf(r)) : value);
        },
      } satisfies Col<Row<T>>;
    });
}

// ─── Component ──────────────────────────────────────────────────────

const BATCH = 25;

function EntityListPageInner<T extends Record<string, any> = any>(
  props: EntityListPageProps<T>,
) {
  const {
    title,
    entityType,
    columns,
    createButtonLabel,
    onCreateClick,
    onRowClick,
    searchPlaceholder = 'Search...',
    defaultFilters = [],
    rowActions,
    bulkActions,
    headerExtra,
    subHeader,
    exportEnabled = true,
    tabs,
    dataSource,
    maxBodyHeight,
  } = props;

  // ── Local state ───────────────────────────────────────────────────
  // `page` means "how many batches have been loaded so far" (1 = just the
  // first) — rows accumulate across batches instead of being replaced.
  const [page, setPage] = useState(1);
  // Bounded-height usage fetches one large batch so the (moderate-sized)
  // dataset is already in hand and the body's own scrollbar does the rest.
  const [pageSize] = useState(maxBodyHeight ? 500 : BATCH);
  const [accumulated, setAccumulated] = useState<T[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>(tabs?.[0]?.key ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);

  // Search applies shortly after typing stops (one query per pause, not per key).
  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return;
    const t = setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  // ── Merge filters: default + active tab ───────────────────────────
  const mergedFilters = useMemo<FilterCriteria[]>(() => {
    const tabFilters = tabs?.find((t) => t.key === activeTab)?.filters ?? [];
    return [...defaultFilters, ...tabFilters];
  }, [defaultFilters, tabs, activeTab]);

  // ── Data fetching via TanStack Query (only when no inline data) ────
  const useInline = Array.isArray(dataSource);
  const { data, isLoading, isFetching, refetch } = useEntityList(
    useInline ? '__noop__' : entityType,
    { page, pageSize, filters: mergedFilters, search },
  );

  // ── Inline filtering / searching ──────────────────────────────────
  const inlineProcessed = useMemo(() => {
    if (!useInline) return { data: [] as T[], total: 0 };
    let rows = [...(dataSource as T[])];

    for (const f of mergedFilters) {
      rows = rows.filter((row) => {
        const v = (row as any)[f.field];
        switch (f.operator) {
          case 'eq':
            return v === f.value;
          case 'gte':
            return v != null && f.value != null && v >= (f.value as any);
          case 'lte':
            return v != null && f.value != null && v <= (f.value as any);
          case 'between':
            return v != null && f.value != null && f.valueTo != null && v >= (f.value as any) && v <= (f.valueTo as any);
          case 'in':
            return Array.isArray(f.value) && (f.value as any[]).includes(v);
          case 'contains':
            return String(v ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase());
          default:
            return true;
        }
      });
    }

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((row) => Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)));
    }

    // Inline mode already has every row in memory, so all of them go to the
    // grid (its column sort then covers the whole set, not a loaded slice).
    return { data: rows, total: rows.length };
  }, [useInline, dataSource, mergedFilters, search]);

  // Remote mode accumulates each fetched batch: `page` resetting to 1
  // (search/tab change/refresh) replaces the set; later batches append,
  // deduped by id in case a refetch redelivers an already-merged batch.
  useEffect(() => {
    if (useInline) return;
    const rows = (data?.data ?? []) as T[];
    if (page === 1) {
      setAccumulated(rows);
      return;
    }
    setAccumulated((prev) => {
      const seen = new Set(prev.map((r) => (r as any).id));
      return [...prev, ...rows.filter((r) => !seen.has((r as any).id))];
    });
  }, [data, page, useInline]);

  const records = (useInline ? inlineProcessed.data : accumulated) as Row<T>[];
  const total = useInline ? inlineProcessed.total : (data?.total ?? 0);
  const hasMore = !useInline && records.length < total;
  const loadingFirstPage = !useInline && isLoading && records.length === 0;

  // Guard each batch so one scroll gesture cannot request it twice.
  const requestedBatch = useRef('');
  const loadMore = useCallback(() => {
    const batch = `${search}|${activeTab}|${records.length}`;
    if (!hasMore || isFetching || requestedBatch.current === batch) return;
    requestedBatch.current = batch;
    setPage((p) => p + 1);
  }, [search, activeTab, records.length, hasMore, isFetching]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    message.success(`Exported ${total} ${title.toLowerCase()} records to CSV`);
  }, [total, title]);

  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key);
    setPage(1);
    setSelected(new Set());
  }, []);

  const handleRefresh = useCallback(() => {
    // Reload restarts the accumulated list rather than refetching only the
    // latest batch — otherwise rows loaded earlier would stay stale.
    setPage(1);
    requestedBatch.current = '';
    refetch();
  }, [refetch]);

  const clearFilters = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setActiveTab(tabs?.[0]?.key ?? '');
    setPage(1);
  }, [tabs]);

  // ── Columns ───────────────────────────────────────────────────────
  const indexById = useMemo(() => new Map(records.map((r, i) => [r.id, i])), [records]);
  const cols = useMemo(() => {
    const base = toDataTableCols<T>(columns, hiddenColumns, (r) => indexById.get((r as Row<T>).id) ?? 0);
    if (rowActions) {
      base.push({
        key: '__actions',
        header: 'Actions',
        render: (r) => (
          <span className="elp-actions" onClick={(e) => e.stopPropagation()}>
            {rowActions(r)}
          </span>
        ),
      });
    }
    return base;
  }, [columns, hiddenColumns, rowActions, indexById]);

  const columnChoices = useMemo(
    () =>
      columns.map((col, i) => {
        const c = asAnt(col);
        const key = colKey(c, i);
        return { key, label: typeof c.title === 'string' ? c.title : key.startsWith('__col') ? `Column ${i + 1}` : key };
      }),
    [columns],
  );

  const toggleColumn = useCallback((key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Selection ─────────────────────────────────────────────────────
  const selectedRecords = useMemo(() => records.filter((r) => selected.has(r.id)), [records, selected]);
  const runBulk = (action: BulkAction) => {
    action.onClick(selectedRecords);
    setSelected(new Set());
  };

  // ── Toolbar ───────────────────────────────────────────────────────
  const filters: ListFilter[] = tabs && tabs.length > 0
    ? [{
        id: '__view',
        label: 'View',
        quick: true,
        value: activeTab,
        defaultValue: tabs[0].key,
        onChange: handleTabChange,
        options: tabs.map((t) => ({ id: t.key, label: t.label })),
      }]
    : [];

  const toolbarActions = [
    ...(exportEnabled ? [{ label: 'Export CSV', icon: Download, onClick: handleExport }] : []),
    { label: 'Choose columns', icon: Columns3, onClick: () => setColumnsOpen(true) },
  ];

  const filtered = !!search || (tabs && tabs.length > 0 && activeTab !== (tabs[0]?.key ?? ''));
  const empty = loadingFirstPage
    ? <Empty icon={Loader2} title="Loading…" />
    : filtered
      ? <Empty icon={SearchX} title="Nothing matches" action={<Btn size="xs" onClick={clearFilters}>Clear filters</Btn>}>Try clearing the search or switching the view.</Empty>
      : <Empty icon={Inbox} title={`No ${title.toLowerCase()} yet`}
          action={onCreateClick && createButtonLabel ? <Btn size="xs" variant="filled" icon={Plus} onClick={onCreateClick}>{createButtonLabel}</Btn> : undefined} />;

  const bulkbar = bulkActions && bulkActions.length > 0 ? (
    <div className="row elp-bulk">
      <span><b>{selected.size}</b> item{selected.size === 1 ? '' : 's'} selected</span>
      {bulkActions.map((action) => (
        <Btn key={action.label} size="xs" variant={action.danger ? 'danger-subtle' : 'outline'}
          onClick={() => (action.danger ? setConfirmAction(action) : runBulk(action))}>
          {action.label}
        </Btn>
      ))}
      <Btn size="xs" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Btn>
    </div>
  ) : undefined;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="ops-root elp">
      <section className="vw-card-section dcl-table elp-card" aria-label={title}>
        {(title || onCreateClick) && (
          <div className="panel-head elp-head">
            <div style={{ minWidth: 0 }}>
              {title && <h3>{title}<span className="count">{total.toLocaleString('en-IN')}</span></h3>}
            </div>
            {onCreateClick && (
              <div className="row">
                <Btn variant="filled" icon={Plus} onClick={onCreateClick}>{createButtonLabel ?? 'Create'}</Btn>
              </div>
            )}
          </div>
        )}

        <div
          onScrollCapture={(e) => {
            const el = e.target as HTMLElement;
            if (!el.classList?.contains('dt-scroll')) return;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) loadMore();
          }}
        >
          <DataTable<Row<T>>
            rows={records}
            cols={cols}
            onRow={onRowClick ? (r) => onRowClick(r) : undefined}
            pageSize={Math.max(records.length, 1)}
            maxHeight={maxBodyHeight ?? 'clamp(320px, 56dvh, 720px)'}
            selectable={!!bulkActions}
            selected={selected}
            onSelect={setSelected}
            bulkbar={bulkbar}
            empty={empty}
            toolbar={
              <>
                <ListToolbar
                  shown={records.length}
                  total={total}
                  search={{ value: searchInput, onChange: setSearchInput, placeholder: searchPlaceholder }}
                  filters={filters}
                  onRefresh={handleRefresh}
                  actions={toolbarActions}
                >
                  {headerExtra}
                </ListToolbar>
                {subHeader && <div className="elp-subheader">{subHeader}</div>}
              </>
            }
          />
        </div>

        {records.length > 0 && hasMore && (
          <div className="elp-foot">
            <span>{records.length.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} loaded</span>
            <Btn size="xs" disabled={isFetching} icon={isFetching ? Loader2 : undefined}
              onClick={() => { requestedBatch.current = ''; loadMore(); }}>
              Load more
            </Btn>
          </div>
        )}
      </section>

      <Modal open={columnsOpen} onClose={() => setColumnsOpen(false)} title="Columns" sub="Choose which columns the list shows" width={380}
        foot={<Btn variant="filled" onClick={() => setColumnsOpen(false)}>Done</Btn>}>
        <div className="col elp-cols">
          {columnChoices.map((c) => (
            <div key={c.key} className="row elp-col-row" onClick={() => toggleColumn(c.key)}>
              <CheckBox on={!hiddenColumns.has(c.key)} label={c.label} onChange={() => toggleColumn(c.key)} />
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={!!confirmAction} onClose={() => setConfirmAction(null)} width={420}
        title={confirmAction ? `${confirmAction.label} ${selected.size} item${selected.size === 1 ? '' : 's'}?` : ''}
        foot={<>
          <Btn onClick={() => setConfirmAction(null)}>Cancel</Btn>
          <Btn variant="danger" onClick={() => { if (confirmAction) runBulk(confirmAction); setConfirmAction(null); }}>{confirmAction?.label ?? 'Confirm'}</Btn>
        </>}>
        <p style={{ margin: 0 }}>This applies to every selected row.</p>
      </Modal>
    </div>
  );
}

// Use a wrapper to preserve generic type inference for consumers
export const EntityListPage = EntityListPageInner as <
  T extends Record<string, any> = any,
>(
  props: EntityListPageProps<T>,
) => React.ReactElement;

export default EntityListPage;
