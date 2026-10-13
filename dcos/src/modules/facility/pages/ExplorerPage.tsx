import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Input, Modal, Popconfirm, Select, Tooltip } from 'antd';
import { ArrowDown, Download, LayoutGrid, Star, Table2, X } from 'lucide-react';
import { DC_SEGMENT } from '../../../mock/data/enums';
import { DC_TYPES_BY_SEGMENT } from '../../../mock/data/dcTypes';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { Btn, Chip, Empty, Seg } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar, type ListFilter } from '../../../ops/ui/ListToolbar';
import { Meter } from '../../../ops/ui/status';
import type { Tone } from '../../../ops/ui/Analytics';
import type { DataCenter, Hall, Rack, Device } from '../../../mock/data/types';
type Entity = 'racks' | 'devices';
type Band = 'high' | 'mid' | 'low';
interface Filters { dc?: string; dcType?: string[]; purpose?: string[]; status?: string[]; band?: Band; liquid?: boolean; category?: string[]; lifecycle?: string[]; }
interface SavedView { id: string; name: string; entity: Entity; search: string; filters: Filters; sortField?: string; sortOrder?: 'ascend' | 'descend'; }
interface SorterState { field?: string; order?: 'ascend' | 'descend' | null; }

const KEY = 'dcos.explorer.views';
const lifecycleTone = (l: string): Tone => (['Retired', 'Disposed'].includes(l) ? 'error' : l === 'Active' ? 'success' : 'neutral');
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

  // Comparators keyed by column key. Rows are sorted here (not inside DataTable)
  // so the sort can be captured in and restored from a saved view.
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

  // Sort state stays here (not inside DataTable) because saved views capture and restore it;
  // headers cycle ascend → descend → off, as before.
  const sortHead = (key: string, label: string) => {
    const on = sorter.field === key && !!sorter.order;
    const next = () => setSorter(!on ? { field: key, order: 'ascend' } : sorter.order === 'ascend' ? { field: key, order: 'descend' } : {});
    return (
      <button type="button" className={`dt-sort${on ? ' is-active' : ''}`} onClick={next}>
        {label}<ArrowDown size={12} style={{ transform: on && sorter.order === 'ascend' ? 'rotate(180deg)' : undefined }} />
      </button>
    );
  };
  const dash = <span className="vw-label">—</span>;

  const rackCols: Col<Rack>[] = [
    { key: 'name', header: sortHead('name', 'Rack'), render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{hallName.get(r.hallId) ?? '—'} · {dcName.get(r.dataCenterId) ?? '—'}</small></span>
    ) },
    { key: 'purpose', header: 'Purpose', render: (r) => <Chip tone={r.purpose === 'GPU' ? 'purple' : 'info'}>{r.purpose}</Chip> },
    { key: 'status', header: 'Status', render: (r) => <Chip tone="neutral" dot>{r.status}</Chip> },
    { key: 'u', header: sortHead('u', 'U used'), render: (r) => <Meter pct={pct(r.usedU, r.heightU)} width={56} color="var(--primaryColor500)" label={`${r.usedU}/${r.heightU}`} /> },
    { key: 'power', header: sortHead('power', 'Power'), render: (r) => (
      <span title={`${r.currentPowerKw}/${r.maxPowerKw} kW`}><Meter pct={r.powerUtilizationPct} width={56} warnAt={60} color={r.powerUtilizationPct >= 85 ? 'var(--vw-color-red-500)' : undefined} /></span>
    ) },
    { key: 'thermal', header: sortHead('thermal', 'Thermal'), align: 'right', render: (r) => <span className="num">{r.thermalDensityKwPerRack} kW</span> },
    { key: 'weight', header: sortHead('weight', 'Weight'), align: 'right', render: (r) => <span className="num">{pct(r.currentWeightKg, r.maxWeightKg)}%</span> },
    { key: 'redundancy', header: 'Redundancy', render: (r) => r.redundancy },
    { key: 'liquid', header: 'Liquid', render: (r) => (r.liquidCoolingReady ? <Chip tone="cyan">ready</Chip> : dash) },
  ];

  const deviceCols: Col<Device>[] = [
    { key: 'name', header: sortHead('name', 'Device'), render: (d) => (
      <span className="cell-2"><span className="vw-card-activity-label">{d.name}</span><small>{d.hostname ?? '—'}</small></span>
    ) },
    { key: 'category', header: 'Category', render: (d) => (d.category ? <Chip tone="neutral">{d.category}</Chip> : dash) },
    { key: 'location', header: 'Data center · Rack', render: (d) => (
      <span className="cell-2"><span>{d.dataCenterId ? dcName.get(d.dataCenterId) ?? '—' : '—'}</span><small>{d.rackId ? `${rackById.get(d.rackId)?.name ?? '—'}${d.position != null ? ` · U${d.position}` : ''}` : '—'}</small></span>
    ) },
    { key: 'power', header: sortHead('power', 'Power (W)'), align: 'right', render: (d) => (d.powerDrawW != null ? <span className="num">{d.powerDrawW.toLocaleString()}</span> : dash) },
    { key: 'lifecycle', header: 'Lifecycle', render: (d) => (d.lifecycleState ? <Chip tone={lifecycleTone(d.lifecycleState)} dot>{d.lifecycleState}</Chip> : dash) },
    { key: 'status', header: 'Status', render: (d) => <Chip tone="neutral">{d.status}</Chip> },
    { key: 'serial', header: 'Serial', render: (d) => (d.serial ? <span className="mono">{d.serial}</span> : dash) },
  ];

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

  const toolbarFilters: ListFilter[] = [
    { id: 'dc', label: 'Data center', quick: true, value: filters.dc ?? '', anyLabel: 'Any data center', onChange: (v) => setFilters((f) => ({ ...f, dc: v || undefined })), options: dataCenters.map((d) => ({ id: d.id, label: d.name })) },
    ...(entity === 'racks' ? [
      { id: 'band', label: 'Power band', quick: true, value: filters.band ?? '', anyLabel: 'Any power band', onChange: (v: string) => setFilters((f) => ({ ...f, band: (v || undefined) as Band | undefined })),
        options: [{ id: 'high', label: '≥85% (hot)' }, { id: 'mid', label: '60–85%' }, { id: 'low', label: '<60%' }] },
      { id: 'liquid', label: 'Liquid cooling', value: filters.liquid == null ? '' : filters.liquid ? 'y' : 'n', anyLabel: 'Any', onChange: (v: string) => setFilters((f) => ({ ...f, liquid: v ? v === 'y' : undefined })),
        options: [{ id: 'y', label: 'Liquid-ready' }, { id: 'n', label: 'Not ready' }] },
    ] : []),
  ];
  const multi = (placeholder: string, value: string[] | undefined, onChange: (v: string[]) => void, opts: string[], minWidth = 150) => (
    <Select allowClear mode="multiple" maxTagCount="responsive" placeholder={placeholder} style={{ minWidth }} value={value} onChange={onChange} options={opts.map((o) => ({ value: o, label: o }))} />
  );
  const toolbar = (
    <ListToolbar shown={rowCount} total={totalCount} noun={entity}
      search={{ value: search, onChange: setSearch, placeholder: entity === 'racks' ? 'Rack, owner, hall' : 'Hostname, serial, model' }}
      filters={toolbarFilters}
      actions={rowCount > 0 ? [{ label: 'Export CSV', icon: Download, onClick: exportCsv }] : []}>
      <Select allowClear mode="multiple" maxTagCount="responsive" showSearch optionFilterProp="label" placeholder="Facility type" style={{ minWidth: 170 }} value={filters.dcType} onChange={(v) => setFilters((f) => ({ ...f, dcType: v }))}
        options={DC_SEGMENT.map((sg) => ({ label: sg, options: DC_TYPES_BY_SEGMENT[sg].map((t) => ({ value: t.key, label: t.name })) }))} />
      {entity === 'racks' ? (
        <>
          {multi('Purpose', filters.purpose, (v) => setFilters((f) => ({ ...f, purpose: v })), purposes)}
          {multi('Status', filters.status, (v) => setFilters((f) => ({ ...f, status: v })), rackStatuses)}
        </>
      ) : (
        <>
          {multi('Category', filters.category, (v) => setFilters((f) => ({ ...f, category: v })), categories, 170)}
          {multi('Lifecycle', filters.lifecycle, (v) => setFilters((f) => ({ ...f, lifecycle: v })), lifecycles, 170)}
          {multi('Status', filters.status, (v) => setFilters((f) => ({ ...f, status: v })), deviceStatuses)}
        </>
      )}
      {activeFilterCount > 0 && <Btn size="xs" variant="ghost" onClick={clearAll}>Clear ({activeFilterCount})</Btn>}
    </ListToolbar>
  );

  return (
    <OpsPage title="Explorer" description="Browse racks and devices, compare utilization, and save useful views." actions={<>
          <Seg size="sm" value={entity} onChange={(v) => { setEntity(v); setSorter({}); if (v === 'devices') setView('table'); }}
            options={[{ id: 'racks', label: 'Racks' }, { id: 'devices', label: 'Devices' }]} />
          {entity === 'racks' && (
            <Seg size="sm" value={view} onChange={setView}
              options={[{ id: 'table', label: 'Table', icon: Table2 }, { id: 'visual', label: 'Visual', icon: LayoutGrid }]} />
          )}
        </>}>

      {/* Saved views */}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Star size={15} style={{ color: 'var(--vw-color-amber-500)', fill: 'var(--vw-color-amber-500)' }} />
        <b className="strong">Saved views:</b>
        {views.length === 0 && <span className="vw-label">none yet — filter, then “Save view”.</span>}
        {views.map((v) => (
          <span key={v.id} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => applyView(v)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyView(v); } }}>
            <Chip tone="info">
              {v.name} <span className="vw-label">· {v.entity}</span>
              <Popconfirm title="Delete this saved view?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={(e) => { e?.stopPropagation(); setViews((xs) => xs.filter((x) => x.id !== v.id)); }}>
                <X size={12} aria-label="Delete saved view" onClick={(e) => e.stopPropagation()} style={{ marginLeft: 4 }} />
              </Popconfirm>
            </Chip>
          </span>
        ))}
        <Btn size="xs" variant="ghost" icon={Star} disabled={activeFilterCount === 0} onClick={() => { setSaveName(''); setSaveOpen(true); }}>Save view</Btn>
      </div>

      {entity === 'racks' && view === 'visual' ? (
        <section className="vw-card-section dcl-table">
          <div className="dt">
            <div className="dt-toolbar" style={{ minHeight: 63 }}>{toolbar}</div>
            <div style={{ padding: 16 }}>
              {racksByHall.length === 0 ? <Empty icon={LayoutGrid} title="No racks match" /> : racksByHall.map(([hid, rks]) => (
                <div key={hid} style={{ marginBottom: 14 }}>
                  <span className="vw-label" style={{ display: 'block', marginBottom: 6 }}>{hallName.get(hid) ?? 'Hall'} <span style={{ color: "var(--vw-color-slate-300)" }}>· {dcName.get(rks[0].dataCenterId) ?? ''} · {rks.length} racks</span></span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {rks.map((r) => (
                      <Tooltip key={r.id} title={`${r.name} · ${r.purpose} · power ${r.powerUtilizationPct}% · ${r.currentPowerKw}/${r.maxPowerKw} kW`}>
                        <div onClick={() => navigate(`/facility/racks/${r.id}`)} style={{ cursor: 'pointer', width: 52, height: 40, borderRadius: 5, background: bandFill(r.powerUtilizationPct), border: `1.5px solid ${bandHex(r.powerUtilizationPct)}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 11, color: "var(--vw-color-slate-700)" }}>{r.name.replace('R-', '')}</span>
                          <span style={{ fontSize: "var(--vw-font-label-xs)", fontWeight: 600, color: bandHex(r.powerUtilizationPct) }}>{r.powerUtilizationPct}%</span>
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ))}
              <div className="row" style={{ gap: 16, marginTop: 6 }}>
                <Lg c="var(--vw-color-green-600)" t="<60%" /><Lg c="#f59e0b" t="60–85%" /><Lg c="var(--vw-color-red-600)" t="≥85%" />
              </div>
            </div>
          </div>
        </section>
      ) : entity === 'racks' ? (
        <section className="vw-card-section dcl-table">
          <DataTable rows={sortedRackRows} cols={rackCols} onRow={(r) => navigate(`/facility/racks/${r.id}`)} pageSize={50} toolbar={toolbar} />
        </section>
      ) : (
        <section className="vw-card-section dcl-table">
          <DataTable rows={sortedDeviceRows} cols={deviceCols} onRow={(d) => navigate(`/facility/devices/${d.id}`)} pageSize={50} toolbar={toolbar} />
        </section>
      )}

      <Modal title="Save current view" open={saveOpen} onOk={saveCurrent} okText="Save" onCancel={() => setSaveOpen(false)} okButtonProps={{ disabled: !saveName.trim() }}>
        <span className="vw-label">Captures the entity, search, filters and sort. Stored in this browser.</span>
        <Input style={{ marginTop: 10 }} placeholder="e.g. Hot GPU racks (LON1)" value={saveName} onChange={(e) => setSaveName(e.target.value)} onPressEnter={saveCurrent} autoFocus />
      </Modal>
    </OpsPage>
  );
}

function Lg({ c, t }: { c: string; t: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)" }}><span style={{ width: 12, height: 12, borderRadius: 3, background: c, display: 'inline-block' }} />{t}</span>;
}
