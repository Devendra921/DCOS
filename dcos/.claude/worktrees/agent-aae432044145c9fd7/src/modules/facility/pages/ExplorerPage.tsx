import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Col, Input, Modal, Popconfirm, Row, Select, Space, Spin, Tooltip, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { SearchOutlined, StarOutlined, StarFilled, DeleteOutlined, DownloadOutlined, AppstoreOutlined, TableOutlined } from '../../../shared/icons';
import { DC_SEGMENT } from '../../../mock/data/enums';
import { DC_TYPES_BY_SEGMENT } from '../../../mock/data/dcTypes';
import type { TableColumnType } from 'antd';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useScrollReveal } from '../../../shared/hooks/useScrollReveal';
import { VwCard, VwChip, VwSegmented} from '../../../shared/components/ux';
import type { DataCenter, Hall, Rack, Device } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
type Entity = 'racks' | 'devices';
type Band = 'high' | 'mid' | 'low';
interface Filters { dc?: string; dcType?: string[]; purpose?: string[]; status?: string[]; band?: Band; liquid?: boolean; category?: string[]; lifecycle?: string[]; }
interface SavedView { id: string; name: string; entity: Entity; search: string; filters: Filters; sortField?: string; sortOrder?: 'ascend' | 'descend'; }
interface SorterState { field?: string; order?: 'ascend' | 'descend' | null; }

const KEY = 'dcos.explorer.views';
const bandTag = (p: number) => (p >= 85 ? 'red' : p >= 60 ? 'orange' : 'green');
const bandHex = (p: number) => (p >= 85 ? 'var(--vw-color-red-600)' : p >= 60 ? '#f59e0b' : p > 0 ? 'var(--vw-color-green-600)' : '#cbd5e1');
const bandFill = (p: number) => (p >= 85 ? '#fee2e2' : p >= 60 ? '#fef3c7' : p > 0 ? '#dcfce7' : '#f1f5f9');
const pct = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 100) : 0);
const uniq = (xs: (string | undefined)[]) => Array.from(new Set(xs.filter(Boolean) as string[])).sort();

export default function ExplorerPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const dataCenters = (useEntityList('dataCenters', { pageSize: 200 }).data?.data ?? []) as unknown as DataCenter[];
  const halls = (useEntityList('halls', { pageSize: 800 }).data?.data ?? []) as unknown as Hall[];
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const devices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];

  const dcName = useMemo(() => new Map(dataCenters.map((d) => [d.id, d.name])), [dataCenters]);
  const dcTypeOf = useMemo(() => new Map(dataCenters.map((d) => [d.id, d.dcTypeKey])), [dataCenters]);
  const hallName = useMemo(() => new Map(halls.map((h) => [h.id, h.name])), [halls]);
  const rackById = useMemo(() => new Map(racks.map((r) => [r.id, r])), [racks]);

  const [entity, setEntity] = useState<Entity>('racks');
  const [view, setView] = useState<'table' | 'visual'>('table');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const typeFilter = filters.dcType;
  const inType = useCallback((dcId?: string) => !typeFilter?.length || (!!dcId && typeFilter.includes(dcTypeOf.get(dcId) ?? '')), [typeFilter, dcTypeOf]);
  const [sorter, setSorter] = useState<SorterState>({});

  // ── saved views (localStorage) ──
  const [views, setViews] = useState<SavedView[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(views)); }, [views]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const applyView = (v: SavedView) => {
    setEntity(v.entity); setSearch(v.search); setFilters(v.filters);
    setSorter({ field: v.sortField, order: v.sortOrder ?? null }); setView('table');
  };
  const saveCurrent = () => {
    const name = saveName.trim();
    if (!name) return;
    const v: SavedView = { id: `V-${Date.now().toString(36)}`, name, entity, search, filters, sortField: sorter.field, sortOrder: sorter.order ?? undefined };
    setViews((xs) => [...xs.filter((x) => x.name !== name), v]);
    setSaveOpen(false); setSaveName(''); message.success(`Saved view “${name}”`);
  };
  const clearAll = () => { setSearch(''); setFilters({}); setSorter({}); };
  const activeFilterCount = (search ? 1 : 0) + Object.values(filters).filter((v) => v != null && (Array.isArray(v) ? v.length : true)).length;

  // ── facets ──
  const purposes = useMemo(() => uniq(racks.map((r) => r.purpose)), [racks]);
  const rackStatuses = useMemo(() => uniq(racks.map((r) => r.status)), [racks]);
  const categories = useMemo(() => uniq(devices.map((d) => d.category)), [devices]);
  const lifecycles = useMemo(() => uniq(devices.map((d) => d.lifecycleState)), [devices]);
  const deviceStatuses = useMemo(() => uniq(devices.map((d) => d.status)), [devices]);
  const inBand = (p: number, b?: Band) => !b || (b === 'high' ? p >= 85 : b === 'mid' ? p >= 60 && p < 85 : p < 60);

  // ── filtered rows ──
  const rackRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return racks.filter((r) =>
      (!filters.dc || r.dataCenterId === filters.dc) && inType(r.dataCenterId) &&
      (!filters.purpose?.length || filters.purpose.includes(r.purpose)) &&
      (!filters.status?.length || filters.status.includes(r.status)) &&
      (filters.liquid == null || r.liquidCoolingReady === filters.liquid) &&
      inBand(r.powerUtilizationPct, filters.band) &&
      (!s || `${r.name} ${r.owner} ${hallName.get(r.hallId) ?? ''}`.toLowerCase().includes(s)),
    );
  }, [racks, filters, search, hallName, inType]);

  const deviceRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return devices.filter((d) =>
      (!filters.dc || d.dataCenterId === filters.dc) && inType(d.dataCenterId) &&
      (!filters.category?.length || (d.category && filters.category.includes(d.category))) &&
      (!filters.lifecycle?.length || (d.lifecycleState && filters.lifecycle.includes(d.lifecycleState))) &&
      (!filters.status?.length || filters.status.includes(d.status)) &&
      (!s || `${d.name} ${d.hostname ?? ''} ${d.serial ?? ''} ${d.model ?? ''} ${d.manufacturer ?? ''}`.toLowerCase().includes(s)),
    );
  }, [devices, filters, search, inType]);

  const sortOrderFor = (field: string) => (sorter.field === field ? sorter.order : null);

  // Column `sorter` comparators, keyed the same as each column's `key` — antd
  // Table normally applies these itself against whatever `dataSource` it's
  // given, but scroll-reveal only hands it a growing slice, so the full
  // filtered array must be sorted here FIRST (same comparators, same
  // direction) before slicing — otherwise sorting would only reorder
  // whichever rows happened to be loaded already.
  const rackComparators: Record<string, (a: Rack, b: Rack) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    u: (a, b) => pct(a.usedU, a.heightU) - pct(b.usedU, b.heightU),
    power: (a, b) => a.powerUtilizationPct - b.powerUtilizationPct,
    thermal: (a, b) => a.thermalDensityKwPerRack - b.thermalDensityKwPerRack,
    weight: (a, b) => pct(a.currentWeightKg, a.maxWeightKg) - pct(b.currentWeightKg, b.maxWeightKg),
  };
  const deviceComparators: Record<string, (a: Device, b: Device) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    power: (a, b) => (a.powerDrawW ?? 0) - (b.powerDrawW ?? 0),
  };
  const sortedRackRows = useMemo(() => {
    const cmp = sorter.field ? rackComparators[sorter.field] : undefined;
    if (!cmp) return rackRows;
    const sorted = [...rackRows].sort(cmp);
    return sorter.order === 'descend' ? sorted.reverse() : sorted;
  }, [rackRows, sorter]); // eslint-disable-line react-hooks/exhaustive-deps
  const sortedDeviceRows = useMemo(() => {
    const cmp = sorter.field ? deviceComparators[sorter.field] : undefined;
    if (!cmp) return deviceRows;
    const sorted = [...deviceRows].sort(cmp);
    return sorter.order === 'descend' ? sorted.reverse() : sorted;
  }, [deviceRows, sorter]); // eslint-disable-line react-hooks/exhaustive-deps
  const rackReveal = useScrollReveal(sortedRackRows, 25, `${search}|${JSON.stringify(filters)}|${sorter.field}|${sorter.order}`);
  const deviceReveal = useScrollReveal(sortedDeviceRows, 25, `${search}|${JSON.stringify(filters)}|${sorter.field}|${sorter.order}`);

  const rackCols: TableColumnType<Rack>[] = [
    { title: 'Rack', dataIndex: 'name', key: 'name', fixed: 'left', sorter: (a, b) => a.name.localeCompare(b.name), sortOrder: sortOrderFor('name'), render: (n: string, r) => <a onClick={() => navigate(`/facility/racks/${r.id}`)}>{n}</a> },
    { title: 'Data center', key: 'dc', render: (_, r) => dcName.get(r.dataCenterId) ?? '—' },
    { title: 'Hall', key: 'hall', render: (_, r) => hallName.get(r.hallId) ?? '—' },
    { title: 'Purpose', dataIndex: 'purpose', key: 'purpose', render: (p: string) => <VwChip color={p === 'GPU' ? 'purple' : 'blue'}>{p}</VwChip> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <VwChip>{s}</VwChip> },
    { title: 'U used', key: 'u', align: 'right', sorter: (a, b) => pct(a.usedU, a.heightU) - pct(b.usedU, b.heightU), sortOrder: sortOrderFor('u'), render: (_, r) => `${r.usedU}/${r.heightU} (${pct(r.usedU, r.heightU)}%)` },
    { title: 'Power', dataIndex: 'powerUtilizationPct', key: 'power', align: 'right', sorter: (a, b) => a.powerUtilizationPct - b.powerUtilizationPct, sortOrder: sortOrderFor('power'), render: (p: number, r) => <Tooltip title={`${r.currentPowerKw}/${r.maxPowerKw} kW`}><VwChip color={bandTag(p)}>{p}%</VwChip></Tooltip> },
    { title: 'Thermal', dataIndex: 'thermalDensityKwPerRack', key: 'thermal', align: 'right', sorter: (a, b) => a.thermalDensityKwPerRack - b.thermalDensityKwPerRack, sortOrder: sortOrderFor('thermal'), render: (t: number) => `${t} kW` },
    { title: 'Weight', key: 'weight', align: 'right', sorter: (a, b) => pct(a.currentWeightKg, a.maxWeightKg) - pct(b.currentWeightKg, b.maxWeightKg), sortOrder: sortOrderFor('weight'), render: (_, r) => `${pct(r.currentWeightKg, r.maxWeightKg)}%` },
    { title: 'Redundancy', dataIndex: 'redundancy', key: 'redundancy' },
    { title: 'Liquid', dataIndex: 'liquidCoolingReady', key: 'liquid', align: 'center', render: (v: boolean) => (v ? <VwChip color="cyan">ready</VwChip> : '—') },
  ];

  const deviceCols: TableColumnType<Device>[] = [
    { title: 'Device', dataIndex: 'name', key: 'name', fixed: 'left', sorter: (a, b) => a.name.localeCompare(b.name), sortOrder: sortOrderFor('name'), render: (n: string, d) => <a onClick={() => navigate(`/facility/devices/${d.id}`)}>{n}</a> },
    { title: 'Hostname', dataIndex: 'hostname', key: 'hostname', render: (h?: string) => h ?? '—' },
    { title: 'Category', dataIndex: 'category', key: 'category', render: (c?: string) => (c ? <VwChip>{c}</VwChip> : '—') },
    { title: 'Data center', key: 'dc', render: (_, d) => (d.dataCenterId ? dcName.get(d.dataCenterId) ?? '—' : '—') },
    { title: 'Rack · U', key: 'rack', render: (_, d) => (d.rackId ? `${rackById.get(d.rackId)?.name ?? '—'}${d.position != null ? ` · U${d.position}` : ''}` : '—') },
    { title: 'Power (W)', dataIndex: 'powerDrawW', key: 'power', align: 'right', sorter: (a, b) => (a.powerDrawW ?? 0) - (b.powerDrawW ?? 0), sortOrder: sortOrderFor('power'), render: (w?: number) => (w != null ? w.toLocaleString() : '—') },
    { title: 'Lifecycle', dataIndex: 'lifecycleState', key: 'lifecycle', render: (l?: string) => (l ? <VwChip color={['Retired', 'Disposed'].includes(l) ? 'red' : l === 'Active' ? 'green' : 'default'}>{l}</VwChip> : '—') },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <VwChip>{s}</VwChip> },
    { title: 'Serial', dataIndex: 'serial', key: 'serial', render: (s?: string) => (s ? <code style={{ fontSize: "var(--vw-font-label-xs)" }}>{s}</code> : '—') },
  ];

  const onTableChange = (_p: unknown, _f: unknown, s: { columnKey?: React.Key; order?: 'ascend' | 'descend' | null } | { columnKey?: React.Key; order?: 'ascend' | 'descend' | null }[]) => {
    const ss = Array.isArray(s) ? s[0] : s;
    // `columnKey` (not `field`) is what matches each column's own `key` —
    // `field` reflects `dataIndex`, which diverges from `key` on computed
    // columns like Power/Thermal (dataIndex set for display, key for
    // identity), silently breaking both the sort-arrow indicator and the
    // actual sort for exactly those two columns.
    setSorter({ field: ss?.columnKey as string, order: ss?.order ?? null });
  };

  const rowCount = entity === 'racks' ? rackRows.length : deviceRows.length;
  const totalCount = entity === 'racks' ? racks.length : devices.length;

  const exportCsv = () => {
    const cols = entity === 'racks'
      ? ['Rack', 'DataCentre', 'Hall', 'Purpose', 'Status', 'UsedU', 'HeightU', 'Power%', 'kW', 'MaxkW', 'ThermalkW', 'Weight%', 'Redundancy', 'Liquid']
      : ['Device', 'Hostname', 'Category', 'DataCentre', 'Rack', 'PositionU', 'PowerW', 'Lifecycle', 'Status', 'Serial'];
    const rows = entity === 'racks'
      ? rackRows.map((r) => [r.name, dcName.get(r.dataCenterId) ?? '', hallName.get(r.hallId) ?? '', r.purpose, r.status, r.usedU, r.heightU, r.powerUtilizationPct, r.currentPowerKw, r.maxPowerKw, r.thermalDensityKwPerRack, pct(r.currentWeightKg, r.maxWeightKg), r.redundancy, r.liquidCoolingReady ? 'yes' : 'no'])
      : deviceRows.map((d) => [d.name, d.hostname ?? '', d.category ?? '', d.dataCenterId ? dcName.get(d.dataCenterId) ?? '' : '', d.rackId ? rackById.get(d.rackId)?.name ?? '' : '', d.position ?? '', d.powerDrawW ?? '', d.lifecycleState ?? '', d.status, d.serial ?? '']);
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `dcos-${entity}-export.csv`; a.click(); URL.revokeObjectURL(url);
    message.success(`Exported ${rows.length} ${entity}`);
  };

  // ── racks visual: dense heat tiles grouped by hall ──
  const racksByHall = useMemo(() => {
    const m = new Map<string, Rack[]>();
    for (const r of rackRows) { const k = r.hallId; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return Array.from(m.entries()).sort((a, b) => (hallName.get(a[0]) ?? '').localeCompare(hallName.get(b[0]) ?? ''));
  }, [rackRows, hallName]);

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div>
          <div className="vw-page-title" role="heading" aria-level={3}>Explorer</div>
        </div>
        <Space>
          <VwSegmented value={entity} onChange={(v) => { setEntity(v as Entity); setSorter({}); if (v === 'devices') setView('table'); }}
            options={[{ label: 'Racks', value: 'racks' }, { label: 'Devices', value: 'devices' }]} />
          {entity === 'racks' && (
            <VwSegmented value={view} onChange={(v) => setView(v as 'table' | 'visual')}
              options={[{ label: 'Table', value: 'table', icon: <TableOutlined /> }, { label: 'Visual', value: 'visual', icon: <AppstoreOutlined /> }]} />
          )}
        </Space>
      </div>

      {/* Saved views */}
      <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", flexWrap: 'wrap', margin: '14px 0 6px' }}>
        <StarFilled style={{ color: "var(--vw-color-amber-500)" }} />
        <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>Saved views:</Text>
        {views.length === 0 && <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>none yet — filter, then “Save view”.</Text>}
        {views.map((v) => (
          <VwChip key={v.id} color="geekblue" style={{ cursor: 'pointer', paddingRight: "var(--vw-space-xxs)" }} onClick={() => applyView(v)}>
            {v.name} <Text type="secondary" style={{ fontSize: "var(--vw-font-label-xs)" }}>· {v.entity}</Text>
            <Popconfirm title="Delete this saved view?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={(e) => { e?.stopPropagation(); setViews((xs) => xs.filter((x) => x.id !== v.id)); }}>
              <DeleteOutlined onClick={(e) => e.stopPropagation()} style={{ marginLeft: 6, fontSize: "var(--vw-font-label-xs)" }} />
            </Popconfirm>
          </VwChip>
        ))}
        <Button size="small" type="link" icon={<StarOutlined />} disabled={activeFilterCount === 0} onClick={() => { setSaveName(''); setSaveOpen(true); }}>Save view</Button>
      </div>

      {/* Filter bar */}
      <VwCard size="small" style={{ marginBottom: "var(--vw-space-md)" }} bodyStyle={{ padding: "var(--vw-space-md)" }}>
        <Space wrap size={[8, 8]}>
          <Input allowClear prefix={<SearchOutlined />} placeholder={entity === 'racks' ? 'Search rack / owner / hall…' : 'Search hostname / serial / model…'} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} />
          <Select allowClear placeholder="Data center" style={{ width: 180 }} value={filters.dc} onChange={(v) => setFilters((f) => ({ ...f, dc: v }))} options={dataCenters.map((d) => ({ value: d.id, label: d.name }))} showSearch optionFilterProp="label" />
          <Select allowClear mode="multiple" maxTagCount="responsive" showSearch optionFilterProp="label" placeholder="Facility type" style={{ minWidth: 170 }} value={filters.dcType} onChange={(v) => setFilters((f) => ({ ...f, dcType: v }))}
            options={DC_SEGMENT.map((sg) => ({ label: sg, options: DC_TYPES_BY_SEGMENT[sg].map((t) => ({ value: t.key, label: t.name })) }))} />
          {entity === 'racks' ? (
            <>
              <Select allowClear mode="multiple" maxTagCount="responsive" placeholder="Purpose" style={{ minWidth: 150 }} value={filters.purpose} onChange={(v) => setFilters((f) => ({ ...f, purpose: v }))} options={purposes.map((p) => ({ value: p, label: p }))} />
              <Select allowClear mode="multiple" maxTagCount="responsive" placeholder="Status" style={{ minWidth: 150 }} value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={rackStatuses.map((s) => ({ value: s, label: s }))} />
              <Select allowClear placeholder="Power band" style={{ width: 150 }} value={filters.band} onChange={(v) => setFilters((f) => ({ ...f, band: v }))}
                options={[{ value: 'high', label: '≥85% (hot)' }, { value: 'mid', label: '60–85%' }, { value: 'low', label: '<60%' }]} />
              <Select allowClear placeholder="Liquid cooling" style={{ width: 160 }} value={filters.liquid == null ? undefined : filters.liquid ? 'y' : 'n'} onChange={(v) => setFilters((f) => ({ ...f, liquid: v == null ? undefined : v === 'y' }))}
                options={[{ value: 'y', label: 'Liquid-ready' }, { value: 'n', label: 'Not ready' }]} />
            </>
          ) : (
            <>
              <Select allowClear mode="multiple" maxTagCount="responsive" placeholder="Category" style={{ minWidth: 170 }} value={filters.category} onChange={(v) => setFilters((f) => ({ ...f, category: v }))} options={categories.map((c) => ({ value: c, label: c }))} />
              <Select allowClear mode="multiple" maxTagCount="responsive" placeholder="Lifecycle" style={{ minWidth: 170 }} value={filters.lifecycle} onChange={(v) => setFilters((f) => ({ ...f, lifecycle: v }))} options={lifecycles.map((l) => ({ value: l, label: l }))} />
              <Select allowClear mode="multiple" maxTagCount="responsive" placeholder="Status" style={{ minWidth: 150 }} value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={deviceStatuses.map((s) => ({ value: s, label: s }))} />
            </>
          )}
          {activeFilterCount > 0 && <Button size="small" onClick={clearAll}>Clear ({activeFilterCount})</Button>}
        </Space>
      </VwCard>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-sm)" }}>
        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-md)" }}>{rowCount.toLocaleString()} of {totalCount.toLocaleString()} {entity}{activeFilterCount > 0 ? ' (filtered)' : ''}</Text>
        <Button size="small" icon={<DownloadOutlined />} onClick={exportCsv} disabled={rowCount === 0}>Export CSV</Button>
      </div>

      {entity === 'racks' && view === 'visual' ? (
        <VwCard size="small">
          {racksByHall.length === 0 ? <Text type="secondary">No racks match.</Text> : racksByHall.map(([hid, rks]) => (
            <div key={hid} style={{ marginBottom: 14 }}>
              <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", display: 'block', marginBottom: 6 }}>{hallName.get(hid) ?? 'Hall'} <span style={{ color: "var(--vw-color-slate-300)" }}>· {dcName.get(rks[0].dataCenterId) ?? ''} · {rks.length} racks</span></Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {rks.map((r) => (
                  <Tooltip key={r.id} title={`${r.name} · ${r.purpose} · power ${r.powerUtilizationPct}% · ${r.currentPowerKw}/${r.maxPowerKw} kW`}>
                    <div onClick={() => navigate(`/facility/racks/${r.id}`)} style={{ cursor: 'pointer', width: 52, height: 40, borderRadius: 5, background: bandFill(r.powerUtilizationPct), border: `1.5px solid ${bandHex(r.powerUtilizationPct)}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 8, color: "var(--vw-color-slate-700)" }}>{r.name.replace('R-', '')}</span>
                      <span style={{ fontSize: "var(--vw-font-label-xs)", fontWeight: 600, color: bandHex(r.powerUtilizationPct) }}>{r.powerUtilizationPct}%</span>
                    </div>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
          <Space size={16} style={{ marginTop: 6 }}>
            <Lg c="var(--vw-color-green-600)" t="<60%" /><Lg c="#f59e0b" t="60–85%" /><Lg c="var(--vw-color-red-600)" t="≥85%" />
          </Space>
        </VwCard>
      ) : entity === 'racks' ? (
        <VwCard bodyStyle={{ padding: 0 }}>
          <Table<Rack> rowKey="id" size="small" dataSource={rackReveal.visible} columns={rackCols} onChange={onTableChange} scroll={{ x: 980 }}
            pagination={false} sticky={TABLE_STICKY} locale={{ emptyText: 'No racks match.' }} />
          {rackReveal.visible.length > 0 && rackReveal.hasMore && (
            <div ref={rackReveal.sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
              <Spin size="small" />
            </div>
          )}
        </VwCard>
      ) : (
        <VwCard bodyStyle={{ padding: 0 }}>
          <Table<Device> rowKey="id" size="small" dataSource={deviceReveal.visible} columns={deviceCols} onChange={onTableChange} scroll={{ x: 980 }}
            pagination={false} sticky={TABLE_STICKY} locale={{ emptyText: 'No devices match.' }} />
          {deviceReveal.visible.length > 0 && deviceReveal.hasMore && (
            <div ref={deviceReveal.sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: "var(--vw-space-lg)" }}>
              <Spin size="small" />
            </div>
          )}
        </VwCard>
      )}

      <Modal title="Save current view" open={saveOpen} onOk={saveCurrent} okText="Save" onCancel={() => setSaveOpen(false)} okButtonProps={{ disabled: !saveName.trim() }}>
        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Captures the entity, search, filters and sort. Stored in this browser.</Text>
        <Input style={{ marginTop: 10 }} placeholder="e.g. Hot GPU racks (LON1)" value={saveName} onChange={(e) => setSaveName(e.target.value)} onPressEnter={saveCurrent} autoFocus />
      </Modal>
    </div>
  );
}

function Lg({ c, t }: { c: string; t: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)" }}><span style={{ width: 12, height: 12, borderRadius: 3, background: c, display: 'inline-block' }} />{t}</span>;
}
