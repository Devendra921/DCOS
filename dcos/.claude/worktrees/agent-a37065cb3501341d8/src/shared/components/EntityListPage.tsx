import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Input, Space, Tabs, message, Dropdown, Popconfirm, Flex } from 'antd';
import { VwTable as Table } from './vw/VwTable';
import { VwButton as Button } from './vw/VwButton';

import {
  PlusOutlined,
  DownloadOutlined,
  SettingOutlined,
  ReloadOutlined,
} from '../icons';
import type { TableProps, TableColumnType } from 'antd';
import type { FilterCriteria } from '../../mock/db/store';
import { useEntityList } from '../hooks/useEntityCRUD';
import { EmptyState, VwCard } from './ux';

const { Search } = Input;

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
   * Optional content rendered between the tabs row and the table.
   * Useful for collapsible filter panels (e.g. Advanced Search).
   */
  subHeader?: React.ReactNode;
  exportEnabled?: boolean;
  tabs?: TabConfig[];
  /**
   * Optional inline data source. When provided, the component bypasses
   * `useEntityList` and uses this array directly. Pagination, search,
   * and tab-filter are performed client-side.
   */
  dataSource?: T[];
  /**
   * When set, bounds the table body to this height (px) with its own
   * internal scrollbar instead of growing the page as more rows load.
   * Use this whenever EntityListPage is embedded as one section of a
   * bigger composite page (sibling sections above/below) rather than
   * being the page's sole, dedicated content — otherwise the list grows
   * unbounded and pushes everything after it further down as it loads.
   */
  maxBodyHeight?: number;
}

// ─── Component ──────────────────────────────────────────────────────

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
  // `page` here means "how many pages have been loaded so far" (1 = just
  // the first), not "which page is currently displayed" — rows accumulate
  // across pages for scroll-triggered loading instead of being replaced.
  const [page, setPage] = useState(1);
  // Bounded-height usage (maxBodyHeight set) has no sentinel inside its own
  // scrollport — the table body's internal overflow clips it, so it would
  // only ever fire once and get stuck after a page or two. Fetch a single
  // large page instead so the whole (moderate-sized) dataset is already in
  // hand and the table's native scrollbar does the rest.
  const [pageSize] = useState(maxBodyHeight ? 500 : 25);
  const [accumulated, setAccumulated] = useState<T[]>([]);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const [activeTab, setActiveTab] = useState<string>(tabs?.[0]?.key ?? '');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());

  // ── Merge filters: default + active tab ───────────────────────────
  const mergedFilters = useMemo<FilterCriteria[]>(() => {
    const tabFilters =
      tabs?.find((t) => t.key === activeTab)?.filters ?? [];
    return [...defaultFilters, ...tabFilters];
  }, [defaultFilters, tabs, activeTab]);

  // ── Data fetching via TanStack Query (only when no inline data) ────
  const useInline = Array.isArray(dataSource);
  const { data, isLoading, isFetching, refetch } = useEntityList(
    useInline ? '__noop__' : entityType,
    {
      page,
      pageSize,
      sortField,
      sortOrder,
      filters: mergedFilters,
      search,
    },
  );

  // ── Inline filtering / searching / sorting / pagination ────────────
  const inlineProcessed = useMemo(() => {
    if (!useInline) return { data: [] as T[], total: 0 };
    let rows = [...(dataSource as T[])];

    // Tab filters
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
            return (
              v != null &&
              f.value != null &&
              f.valueTo != null &&
              v >= (f.value as any) &&
              v <= (f.valueTo as any)
            );
          case 'in':
            return Array.isArray(f.value) && (f.value as any[]).includes(v);
          case 'contains':
            return String(v ?? '')
              .toLowerCase()
              .includes(String(f.value ?? '').toLowerCase());
          default:
            return true;
        }
      });
    }

    // Search across stringifiable fields
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((row) =>
        Object.values(row).some((v) =>
          String(v ?? '').toLowerCase().includes(q),
        ),
      );
    }

    // Sort
    if (sortField) {
      rows.sort((a, b) => {
        const av = (a as any)[sortField];
        const bv = (b as any)[sortField];
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return sortOrder === 'desc' ? -cmp : cmp;
      });
    }

    // Cumulative slice (0..page*pageSize) rather than a single page window
    // — inline mode has the full array in memory already, so "loading more"
    // is just widening the slice, no extra fetch needed.
    const total = rows.length;
    return { data: rows.slice(0, page * pageSize), total };
  }, [
    useInline,
    dataSource,
    mergedFilters,
    search,
    sortField,
    sortOrder,
    page,
    pageSize,
  ]);

  // Remote mode accumulates each fetched page into `accumulated` instead of
  // replacing it, so scrolling further down grows the list rather than
  // swapping it out. `page` resetting to 1 (search/sort/tab change) replaces
  // the accumulated set; any later page appends (deduped by id in case a
  // query refetch redelivers an already-merged page).
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

  const records = useInline ? (inlineProcessed.data as T[]) : accumulated;
  const total = useInline ? inlineProcessed.total : (data?.total ?? 0);
  const hasMore = records.length < total;
  // First-load spinner only — once rows exist, further loads use the
  // sentinel's own inline spinner so the whole table doesn't blank out.
  const loadingFirstPage = isLoading && records.length === 0;

  // Bound row scrolling without changing the query/accumulation model.
  // Guard each loaded batch so one scroll gesture cannot request it twice.
  const requestedBatch = useRef('');
  const loadMore = useCallback(() => {
    const batch = `${search}|${activeTab}|${sortField}|${sortOrder}|${records.length}`;
    if (!hasMore || isFetching || requestedBatch.current === batch) return;
    requestedBatch.current = batch;
    setPage((p) => p + 1);
  }, [search, activeTab, sortField, sortOrder, records.length, hasMore, isFetching]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(1);
    },
    [],
  );

  const handleTableChange: TableProps<T>['onChange'] = useCallback(
    (_pagination: any, _filters: any, sorter: any) => {
      // Sort changes restart accumulation from page 1 — appending a newly
      // re-sorted page onto the previous sort order's rows would interleave
      // two different orderings into one broken list.
      setPage(1);
      if (sorter && !Array.isArray(sorter)) {
        setSortField(sorter.field as string | undefined);
        setSortOrder(
          sorter.order === 'ascend'
            ? 'asc'
            : sorter.order === 'descend'
              ? 'desc'
              : undefined,
        );
      }
    },
    [],
  );

  const handleExport = useCallback(() => {
    message.success(`Exported ${total} ${title.toLowerCase()} records to CSV`);
  }, [total, title]);

  const handleTabChange = useCallback(
    (key: string) => {
      setActiveTab(key);
      setPage(1);
      setSelectedRowKeys([]);
    },
    [],
  );

  // ── Build visible columns + optional actions column ───────────────
  const visibleColumns = useMemo(() => {
    const base = columns.filter(
      (col) => {
        const key = (col as any).dataIndex ?? (col as any).key;
        return key ? !hiddenColumns.has(String(key)) : true;
      },
    );

    if (rowActions) {
      base.push({
        title: 'Actions',
        key: '__actions',
        width: 120,
        fixed: 'right' as const,
        render: (_: unknown, record: T) => rowActions(record),
      } as TableColumnType<T>);
    }

    return base;
  }, [columns, hiddenColumns, rowActions]);

  // ── Column visibility toggle menu items ───────────────────────────
  const columnMenuItems = useMemo(
    () =>
      columns
        .map((col) => {
          const key = String(
            (col as any).dataIndex ?? (col as any).key ?? '',
          );
          if (!key) return null;
          const label = typeof col.title === 'string' ? col.title : key;
          return {
            key,
            label: (
              <span>
                <input
                  type="checkbox"
                  checked={!hiddenColumns.has(key)}
                  readOnly
                  style={{ marginRight: "var(--vw-space-sm)" }}
                />
                {label}
              </span>
            ),
          };
        })
        .filter(Boolean) as { key: string; label: React.ReactNode }[],
    [columns, hiddenColumns],
  );

  const handleColumnToggle = useCallback(
    ({ key }: { key: string }) => {
      setHiddenColumns((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },
    [],
  );

  // ── Row selection config ──────────────────────────────────────────
  const rowSelection: TableProps<T>['rowSelection'] = bulkActions
    ? {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
      }
    : undefined;

  const selectedRecords = useMemo(
    () =>
      records.filter((r) =>
        selectedRowKeys.includes((r as any).id ?? (r as any).key),
      ),
    [records, selectedRowKeys],
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="vw-flex vw-flex-col vw-page-gap" style={{ minWidth: 0 }}>
      <VwCard className="vw-data-grid" bodyStyle={{ padding: 0 }}>
        {/* Reference table anatomy: identity, controls, tabs, then the data grid. */}
        <Flex className="vw-table-heading" justify="space-between" align="center" wrap="wrap" gap={12}>
          <Flex vertical gap={2}>
            {title && <div className="vw-page-title" role="heading" aria-level={3}>
              {title}
            </div>}
            <span className="vw-label" aria-live="polite">
              Showing {records.length} of {total} {title.toLowerCase()}
            </span>
          </Flex>

          {onCreateClick && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onCreateClick}
            >
              {createButtonLabel ?? 'Create'}
            </Button>
          )}
        </Flex>
        <Flex className="vw-table-toolbar" justify="space-between" align="center" wrap="wrap" gap={12}>
          <Space className="dcos-list-actions" wrap>
            {headerExtra}
            <Search
              placeholder={searchPlaceholder}
              allowClear
              onSearch={handleSearch}
              aria-label={searchPlaceholder}
              style={{ width: 260, maxWidth: '100%' }}
            />
          </Space>
          <Space className="dcos-list-actions" wrap>
            {exportEnabled && (
              <Button icon={<DownloadOutlined />} onClick={handleExport}>
                Export
              </Button>
            )}
            <Dropdown
              menu={{ items: columnMenuItems, onClick: handleColumnToggle }}
              trigger={['click']}
            >
              <Button aria-label="Choose visible columns" title="Choose visible columns" icon={<SettingOutlined />} />
            </Dropdown>
            <Button
              icon={<ReloadOutlined />}
              aria-label="Refresh records"
              title="Refresh records"
              onClick={() => {
                // Reload starts the accumulated list fresh rather than just
                // refetching whichever page happens to be topmost after
                // scrolling — otherwise rows loaded earlier via scroll would
                // stay stale indefinitely.
                setPage(1);
                refetch();
              }}
              loading={isFetching}
            />

          </Space>
        </Flex>

        {/* Tabs (optional) */}
        {tabs && tabs.length > 0 && (
          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            items={tabs.map((t) => ({ key: t.key, label: t.label }))}
            className="vw-table-tabs"
          />
        )}

        {/* Sub-header slot (e.g. Advanced Search panel) */}
        {subHeader && <div className="vw-table-subheader">{subHeader}</div>}

        {/* Bulk action bar */}
        {bulkActions && selectedRowKeys.length > 0 && (
          <VwCard size="small" variant="child" tone="info" style={{ margin: 'var(--vw-space-lg)' }}>
            <Flex align="center" gap={12} wrap="wrap">
              <span>
                <strong>{selectedRowKeys.length}</strong> item
                {selectedRowKeys.length > 1 ? 's' : ''} selected
              </span>
              <Space wrap>
                {bulkActions.map((action) =>
                  action.danger ? (
                    <Popconfirm
                      key={action.label}
                      title={`${action.label} ${selectedRowKeys.length} items?`}
                      onConfirm={() => {
                        action.onClick(selectedRecords);
                        setSelectedRowKeys([]);
                      }}
                    >
                      <Button size="small" danger>
                        {action.label}
                      </Button>
                    </Popconfirm>
                  ) : (
                    <Button
                      key={action.label}
                      size="small"
                      onClick={() => {
                        action.onClick(selectedRecords);
                        setSelectedRowKeys([]);
                      }}
                    >
                      {action.label}
                    </Button>
                  ),
                )}
              </Space>
              <Button
                size="small"
                type="link"
                onClick={() => setSelectedRowKeys([])}
              >
                Clear
              </Button>
            </Flex>
          </VwCard>
        )}

        {/* Table */}
        <Table<T>
          rowKey="id"
          aria-label={title}
          columns={visibleColumns}
          dataSource={records}
          loading={loadingFirstPage}
          rowSelection={rowSelection}
          onChange={handleTableChange}
          pagination={false}
          scroll={{ x: 'max-content', y: maxBodyHeight ?? 'clamp(280px, 44dvh, 640px)' }}
          onScroll={(event) => {
            const body = event.currentTarget;
            if (body.scrollHeight - body.scrollTop - body.clientHeight < 120) loadMore();
          }}
          onRow={(record) => ({
            onClick: onRowClick ? () => onRowClick(record) : undefined,
            style: onRowClick ? { cursor: 'pointer' } : undefined,
          })}
          size="middle"
          locale={{
            emptyText: (
              <EmptyState
                variant={search || (tabs && tabs.length > 0 && activeTab !== (tabs[0]?.key ?? '')) ? 'no-results' : 'no-data'}
                entity={entityType}
                primaryAction={
                  search || (tabs && tabs.length > 0 && activeTab !== (tabs[0]?.key ?? ''))
                    ? {
                        label: 'Clear filters',
                        onClick: () => {
                          setSearch('');
                          setActiveTab(tabs?.[0]?.key ?? '');
                          setPage(1);
                        },
                      }
                    : onCreateClick && createButtonLabel
                      ? {
                          label: `+ ${createButtonLabel}`,
                          onClick: onCreateClick,
                        }
                      : undefined
                }
              />
            ),
          }}
        />
        {records.length > 0 && hasMore && (
          <div className="vw-grid-footer">
            <span>{records.length} of {total} loaded</span>
            <Button size="small" loading={isFetching} onClick={() => { requestedBatch.current = ''; loadMore(); }}>Load more</Button>
          </div>
        )}
      </VwCard>
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
