/* Work orders — /delivery/work-orders. Every piece of field work in delivery, each with its
   change request (one per work order). Summary tiles, filters kept in the URL (including "kit not
   ready"), one table with the kit readiness of each work order (advisory). */
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Facts, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { DcScopeSelect, useDcScope } from '../../../core/scope/DcScope';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { WORK_ORDER_STATUS, WORK_ORDER_TYPE } from '../../../mock/data/enums';
import { useDeliveryData } from '../lib/chain';
import { useMaterialData } from '../lib/materialHooks';
import { isLive, readinessOf, READINESS_TONE, type ReadinessView } from '../lib/materialRules';
import type * as T from '../../../mock/data/types';
import { kitNotReady } from '../components/workorders/materialsView';
import { opsTone } from '../components/home/tones';
import {
  buildWorkOrderRows, NOT_DONE, CHG_STATUS_LABEL, CHG_STATUS_TONE, CLASS_TONE, siteNamer, windowLines, typeLabel, woStatusLabel, woStatusTone, type WorkOrderRow,
} from '../components/workorders/model';

const base = '/delivery/work-orders';
const stop = (e: React.MouseEvent) => e.stopPropagation();
type Row = WorkOrderRow & { id: string };

export default function WorkOrdersPage() {
  const navigate = useNavigate();
  const d = useDeliveryData();
  const md = useMaterialData();
  const { dcId } = useDcScope();
  const [params, setParams] = useSearchParams();
  const f = { status: params.get('status') ?? 'open', type: params.get('type') ?? undefined, project: params.get('project') ?? undefined, kind: params.get('kind') ?? undefined, vendor: params.get('vendor') ?? undefined, due: params.get('due') ?? undefined, kit: params.get('kit') ?? undefined };
  const set = (k: string, v?: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };
  // Several filters applied at once from the filter panel: one navigation.
  const patch = (p: Record<string, string>) => { const n = new URLSearchParams(params); Object.entries(p).forEach(([k, v]) => (v && !(k === 'status' && v === 'open') ? n.set(k, v) : n.delete(k))); setParams(n, { replace: true }); };

  const all = useMemo(() => buildWorkOrderRows(d), [d]);
  const kits = useMemo(() => {
    const by = new Map<string, T.MaterialLine[]>();
    for (const l of md.materialLines) if (l.workOrderId && isLive(l)) by.set(l.workOrderId, [...(by.get(l.workOrderId) ?? []), l]);
    return new Map<string, ReadinessView>([...by].map(([id, ls]) => [id, readinessOf(ls)]));
  }, [md.materialLines]);
  const kitOf = (r: WorkOrderRow) => kits.get(r.wo.id) ?? readinessOf([]);
  const kitShort = (r: WorkOrderRow) => r.open && kitNotReady(kitOf(r));
  const racks = useEntityList('racks', { pageSize: 100000, filters: [{ field: 'id', operator: 'in', value: [...new Set(all.flatMap(r => r.wo.rackIds ?? (r.wo.rackId ? [r.wo.rackId] : [])))] }] }).data?.data as { id: string; name: string }[] | undefined;
  const rackName = useMemo(() => new Map((racks ?? []).map(r => [r.id, r.name])), [racks]);
  const site = useMemo(() => siteNamer(d), [d]);
  const inSite = all.filter(r => dcId === 'all' || r.siteId === dcId);

  const shown: Row[] = inSite.filter(r =>
    (f.status === 'all' || (f.status === 'open' ? r.open : r.wo.status === f.status))
    && (!f.type || r.wo.type === f.type) && (!f.project || r.project?.id === f.project)
    && (!f.kind || (r.wo.assigneeKind ?? 'internal') === f.kind) && (!f.vendor || r.wo.contractorVendorId === f.vendor)
    && (!f.due || (f.due === 'today' ? r.dueToday : r.overdue))
    && (!f.kit || (f.kit === 'notready' ? kitShort(r) : f.kit === 'ready' ? kitOf(r).state === 'Ready' : kitOf(r).state === 'Not needed')))
    .sort((a, b) => Number(!NOT_DONE.includes(a.wo.status)) - Number(!NOT_DONE.includes(b.wo.status)) || (a.start ?? '9').localeCompare(b.start ?? '9'))
    .map(r => ({ ...r, id: r.wo.id }));

  const open = inSite.filter(r => r.open);
  const count = (s: string) => inSite.filter(r => r.wo.status === s).length;
  const projects = useMemo(() => d.projects.filter(p => all.some(r => r.project?.id === p.id)), [d.projects, all]);
  const vendors = useMemo(() => d.vendors.filter(v => v.status !== 'Inactive'), [d.vendors]);
  const overdue = open.filter(r => r.overdue).length, dueToday = open.filter(r => r.dueToday).length, short = open.filter(kitShort).length;

  const cols: Col<Row>[] = [
    { key: 't', header: 'Work order', render: r => <span className="cell-2"><Link className="vw-card-activity-label" to={`${base}/${r.wo.id}`} onClick={stop}>{r.wo.woId ?? r.wo.id}</Link><small>{r.title} · {typeLabel(r.wo.type)}</small></span> },
    { key: 's', header: 'Site and racks', render: r => { const ids = r.wo.rackIds ?? (r.wo.rackId ? [r.wo.rackId] : []); return <span className="cell-2"><span>{site(r.siteId)}</span>{ids.length > 0 && <small>{ids.slice(0, 3).map(id => rackName.get(id) ?? id).join(', ') + (ids.length > 3 ? ` +${ids.length - 3}` : '')}</small>}</span>; } },
    { key: 'p', header: 'Project', render: r => (r.project ? <Link to={`/delivery/projects/${r.project.id}`} onClick={stop}>{r.project.name}</Link> : <span className="vw-label">none</span>) },
    { key: 'a', header: 'Assignee', render: r => <span className="cell-2"><span>{r.assignee}</span>{(r.wo.assigneeKind === 'contractor' || r.wo.assigneeName) && <small>{r.wo.assigneeKind === 'contractor' ? 'Contractor' : 'Own technician'}</small>}</span> },
    { key: 'w', header: 'Window', render: r => { const w = windowLines(r.start, r.end); return <span className="cell-2"><span className="num">{w.main}</span>{w.sub && <small>{w.sub}</small>}</span>; } },
    { key: 'st', header: 'Status', render: r => <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}><Chip tone={opsTone(woStatusTone(r.wo.status))} dot>{woStatusLabel(r.wo.status)}</Chip>{r.overdue && <Chip tone="error">Overdue</Chip>}</span> },
    { key: 'k', header: 'Kit', render: r => { const k = kitOf(r); return k.state === 'Not needed' ? <span className="vw-label">none</span> : <Chip tone={READINESS_TONE[k.state]} title={k.reasons.join('; ') || undefined}>{k.state}</Chip>; } },
    { key: 'c', header: 'Change', render: r => (r.change
      ? <span className="cell-2"><Link to={`/changes/${r.change.id}`} onClick={stop}>{r.change.chgId ?? r.change.id}</Link><span className="row" style={{ gap: 4, flexWrap: 'wrap' }}><Chip tone={opsTone(CLASS_TONE[r.changeClass ?? 'Normal'])} size="xs">{r.changeClass}</Chip><Chip tone={opsTone(CHG_STATUS_TONE[r.change.status])} size="xs" dot>{CHG_STATUS_LABEL[r.change.status]}</Chip></span></span>
      : <Chip tone="error">No change</Chip>) },
  ];

  return (
    <OpsPage title="Work orders" description="Every piece of field work in delivery, each with its change request.">
      <StatGrid>
        <StatTile label="Open" value={open.length} sub={`of ${inSite.length} work orders`} onClick={() => navigate(base)} />
        <StatTile label="Awaiting approval" value={count('Awaiting change approval')} sub="change not approved" subTone={count('Awaiting change approval') ? 'warn' : undefined} onClick={() => navigate(`${base}?status=Awaiting change approval`)} active={f.status === 'Awaiting change approval'} />
        <StatTile label="Ready to start" value={count('Ready') + count('Assigned')} sub={`${count('Ready')} still to assign`} onClick={() => navigate(`${base}?status=Ready`)} active={f.status === 'Ready'} />
        <StatTile label="In progress" value={count('InProgress')} sub="crews on site" onClick={() => navigate(`${base}?status=InProgress`)} active={f.status === 'InProgress'} />
        <StatTile label="Overdue" value={overdue} sub="window has passed" subTone={overdue ? 'bad' : undefined} onClick={() => navigate(`${base}?due=overdue`)} active={f.due === 'overdue'}>
          <Facts items={[{ n: dueToday, label: 'due today · window opens today', onClick: () => navigate(`${base}?due=today`) }]} />
        </StatTile>
        <StatTile label="Kit not ready" value={short} sub="not all at the site" subTone={short ? 'warn' : undefined} onClick={() => navigate(`${base}?kit=notready`)} active={f.kit === 'notready'} />
      </StatGrid>

      <section className="vw-card-section dcl-table">
        {!d.ready ? <Empty icon={ClipboardList} title="Loading work orders">Reading the delivery chain…</Empty> : (
          <DataTable rows={shown} cols={cols} onRow={r => navigate(`${base}/${r.wo.id}`)} pageSize={30}
            empty={<Empty icon={ClipboardList} title={inSite.length ? 'No work order matches' : 'No work orders yet'}>
              {inSite.length ? 'Clear the filters, or choose All work orders to include closed ones.' : 'Work orders are raised by project steps; each one raises its change request.'}
            </Empty>}
            toolbar={
              <ListToolbar shown={shown.length} total={inSite.length} noun="work orders" onApply={patch}
                filters={[
                  { id: 'status', label: 'Status', quick: true, value: f.status, defaultValue: 'open', onChange: v => set('status', v === 'open' ? undefined : v),
                    options: [{ id: 'open', label: 'Open work orders', count: open.length }, { id: 'all', label: 'All work orders', count: inSite.length }, ...WORK_ORDER_STATUS.map(s => ({ id: s, label: woStatusLabel(s), count: count(s) }))] },
                  { id: 'type', label: 'Type', quick: true, value: f.type ?? '', anyLabel: 'Any type', onChange: v => set('type', v || undefined), options: WORK_ORDER_TYPE.map(t => ({ id: t, label: typeLabel(t), count: inSite.filter(r => r.wo.type === t).length })) },
                  { id: 'project', label: 'Project', value: f.project ?? '', anyLabel: 'All projects', onChange: v => set('project', v || undefined), options: projects.map(p => ({ id: p.id, label: p.name })) },
                  { id: 'kind', label: 'Own staff or contractor', value: f.kind ?? '', anyLabel: 'Own staff or contractor', onChange: v => set('kind', v || undefined), options: [{ id: 'internal', label: 'Own technicians' }, { id: 'contractor', label: 'Contractors' }] },
                  { id: 'kit', label: 'Kit', value: f.kit ?? '', anyLabel: 'Any kit state', onChange: v => set('kit', v || undefined), options: [{ id: 'notready', label: 'Kit not ready' }, { id: 'ready', label: 'Kit at the site' }, { id: 'none', label: 'No kit needed' }] },
                  { id: 'vendor', label: 'Contractor company', value: f.vendor ?? '', anyLabel: 'Any contractor', onChange: v => set('vendor', v || undefined), options: vendors.map(v => ({ id: v.id, label: v.name })) },
                  { id: 'due', label: 'Due', value: f.due ?? '', anyLabel: 'Any due date', onChange: v => set('due', v || undefined), options: [{ id: 'today', label: 'Due today', count: dueToday }, { id: 'overdue', label: 'Overdue', count: overdue }] },
                ]}>
                <DcScopeSelect />
              </ListToolbar>
            } />
        )}
      </section>
    </OpsPage>
  );
}
