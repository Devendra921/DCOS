/* Work orders — /delivery/work-orders. Every piece of field work in delivery, each with its
   change request (one per work order). Summary row, filters kept in the URL, one table. */
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Select } from 'antd';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { DcScopeSelect, useDcScope } from '../../../core/scope/DcScope';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { WORK_ORDER_STATUS, WORK_ORDER_TYPE } from '../../../mock/data/enums';
import { useDeliveryData } from '../lib/chain';
import { DataTable, Muted, SummaryRow, TwoLine } from '../components/home/kit';
import {
  buildWorkOrderRows, NOT_DONE, CHG_STATUS_LABEL, CHG_STATUS_TONE, CLASS_TONE, siteNamer, windowLines, typeLabel, woStatusLabel, woStatusTone, type WorkOrderRow,
} from '../components/workorders/model';

const base = '/delivery/work-orders';

export default function WorkOrdersPage() {
  const d = useDeliveryData();
  const { dcId } = useDcScope();
  const [params, setParams] = useSearchParams();
  const f = { status: params.get('status') ?? 'open', type: params.get('type') ?? undefined, project: params.get('project') ?? undefined, kind: params.get('kind') ?? undefined, vendor: params.get('vendor') ?? undefined, due: params.get('due') ?? undefined };
  const set = (k: string, v?: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  const all = useMemo(() => buildWorkOrderRows(d), [d]);
  const racks = useEntityList('racks', { pageSize: 100000, filters: [{ field: 'id', operator: 'in', value: [...new Set(all.flatMap(r => r.wo.rackIds ?? (r.wo.rackId ? [r.wo.rackId] : [])))] }] }).data?.data as { id: string; name: string }[] | undefined;
  const rackName = useMemo(() => new Map((racks ?? []).map(r => [r.id, r.name])), [racks]);
  const site = useMemo(() => siteNamer(d), [d]);
  const inSite = all.filter(r => dcId === 'all' || r.siteId === dcId);

  const shown = inSite.filter(r =>
    (f.status === 'all' || (f.status === 'open' ? r.open : r.wo.status === f.status))
    && (!f.type || r.wo.type === f.type) && (!f.project || r.project?.id === f.project)
    && (!f.kind || (r.wo.assigneeKind ?? 'internal') === f.kind) && (!f.vendor || r.wo.contractorVendorId === f.vendor)
    && (!f.due || (f.due === 'today' ? r.dueToday : r.overdue)))
    .sort((a, b) => Number(!NOT_DONE.includes(a.wo.status)) - Number(!NOT_DONE.includes(b.wo.status)) || (a.start ?? '9').localeCompare(b.start ?? '9'));

  const open = inSite.filter(r => r.open);
  const count = (s: string) => inSite.filter(r => r.wo.status === s).length;
  const projects = useMemo(() => d.projects.filter(p => all.some(r => r.project?.id === p.id)), [d.projects, all]);
  const vendors = useMemo(() => d.vendors.filter(v => v.status !== 'Inactive'), [d.vendors]);
  const filtered = f.status !== 'open' || f.type || f.project || f.kind || f.vendor || f.due;

  if (!d.ready) return <VwCard loading>Loading work orders…</VwCard>;
  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <SummaryRow items={[
        { label: 'Open', value: open.length, sub: `of ${inSite.length} work orders`, to: base },
        { label: 'Awaiting approval', value: count('Awaiting change approval'), sub: 'change not approved', tone: count('Awaiting change approval') ? 'warn' : undefined, to: `${base}?status=Awaiting change approval` },
        { label: 'Ready to start', value: count('Ready') + count('Assigned'), sub: `${count('Ready')} still to assign`, to: `${base}?status=Ready` },
        { label: 'In progress', value: count('InProgress'), sub: 'crews on site', to: `${base}?status=InProgress` },
        { label: 'Due today', value: open.filter(r => r.dueToday).length, sub: 'window opens today', to: `${base}?due=today` },
        { label: 'Overdue', value: open.filter(r => r.overdue).length, sub: 'window has passed', tone: open.some(r => r.overdue) ? 'bad' : undefined, to: `${base}?due=overdue` },
      ]} />

      <div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
        <Select value={f.status} onChange={v => set('status', v === 'open' ? undefined : v)} style={{ minWidth: 200 }} aria-label="Status"
          options={[{ value: 'open', label: 'Open work orders' }, { value: 'all', label: 'All work orders' }, ...WORK_ORDER_STATUS.map(s => ({ value: s, label: woStatusLabel(s) }))]} />
        <Select allowClear placeholder="Any type" value={f.type} onChange={v => set('type', v)} style={{ minWidth: 150 }} aria-label="Type" options={WORK_ORDER_TYPE.map(t => ({ value: t, label: typeLabel(t) }))} />
        <DcScopeSelect />
        <Select allowClear placeholder="All projects" value={f.project} onChange={v => set('project', v)} style={{ minWidth: 200 }} showSearch optionFilterProp="label" aria-label="Project" options={projects.map(p => ({ value: p.id, label: p.name }))} />
        <Select allowClear placeholder="Own staff or contractor" value={f.kind} onChange={v => set('kind', v)} style={{ minWidth: 190 }} aria-label="Assignee kind" options={[{ value: 'internal', label: 'Own technicians' }, { value: 'contractor', label: 'Contractors' }]} />
        <Select allowClear placeholder="Any contractor" value={f.vendor} onChange={v => set('vendor', v)} style={{ minWidth: 170 }} showSearch optionFilterProp="label" aria-label="Contractor company" options={vendors.map(v => ({ value: v.id, label: v.name }))} />
        {f.due && <VwChip variant="warning" onClick={() => set('due')}>{f.due === 'today' ? 'Due today' : 'Overdue'} ×</VwChip>}
        {filtered && <button type="button" className="nst-btn nst-btn--ghost nst-btn--sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</button>}
        <span style={{ flex: 1 }} />
        <Muted>{shown.length} shown</Muted>
      </div>

      <VwCard>
        <DataTable<WorkOrderRow> rows={shown} rowKey={r => r.wo.id} to={r => `${base}/${r.wo.id}`}
          empty={inSite.length ? 'No work order matches. Clear the filters, or choose All work orders to include closed ones.' : 'No work orders yet. Work orders are raised by project steps; each one raises its change request.'}
          cols={[
            { key: 'id', title: 'Work order', render: r => <Link to={`${base}/${r.wo.id}`}>{r.wo.woId ?? r.wo.id}</Link> },
            { key: 't', title: 'Title', wrap: true, minWidth: 200, render: r => <TwoLine main={r.title} sub={typeLabel(r.wo.type)} /> },
            { key: 's', title: 'Site and racks', wrap: true, minWidth: 110, render: r => { const ids = r.wo.rackIds ?? (r.wo.rackId ? [r.wo.rackId] : []); return <TwoLine main={site(r.siteId)} sub={ids.length ? ids.slice(0, 3).map(id => rackName.get(id) ?? id).join(', ') + (ids.length > 3 ? ` +${ids.length - 3}` : '') : undefined} />; } },
            { key: 'p', title: 'Project', wrap: true, minWidth: 120, render: r => (r.project ? <Link to={`/delivery/projects/${r.project.id}`}>{r.project.name}</Link> : <Muted>none</Muted>) },
            { key: 'a', title: 'Assignee', wrap: true, minWidth: 110, render: r => <TwoLine main={r.assignee} sub={r.wo.assigneeKind === 'contractor' ? 'Contractor' : r.wo.assigneeName ? 'Own technician' : undefined} /> },
            { key: 'w', title: 'Window', wrap: true, minWidth: 150, render: r => { const w = windowLines(r.start, r.end); return <TwoLine main={w.main} sub={w.sub} />; } },
            { key: 'st', title: 'Status', render: r => <span className="vw-inline-flex vw-gap-xs vw-wrap"><VwChip variant={woStatusTone(r.wo.status)}>{woStatusLabel(r.wo.status)}</VwChip>{r.overdue && <VwChip variant="error">Overdue</VwChip>}</span> },
            { key: 'c', title: 'Change', wrap: true, minWidth: 120, render: r => (r.change
              ? <div className="vw-flex vw-flex-col" style={{ gap: 2 }}><Link to={`/changes/${r.change.id}`}>{r.change.chgId ?? r.change.id}</Link><span className="vw-flex vw-wrap vw-gap-xs"><VwChip variant={CLASS_TONE[r.changeClass ?? 'Normal']}>{r.changeClass}</VwChip><VwChip variant={CHG_STATUS_TONE[r.change.status]}>{CHG_STATUS_LABEL[r.change.status]}</VwChip></span></div>
              : <VwChip variant="error">No change</VwChip>) },
          ]} />
      </VwCard>
    </div>
  );
}
