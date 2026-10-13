/* Build initiation: what approval creates — the delivery vehicle, its projects, purchase orders per vendor, reserved stock and rack positions, permits, design documents and the work order. */
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Tooltip } from 'antd';
import { Boxes, ClipboardList, FileStack, FileText, FolderKanban, GitBranch, Layers, PackageCheck, ShoppingCart, Stamp } from 'lucide-react';
import type * as T from '../../../../mock/data/types';
import { fmtDate } from '../../../../shared/components/ux';
import { Chip, Empty, Panel } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { fmtUsd } from '../../lib/engine';
import type { Initiation, InitChildPlan, InitProject, PermitGate } from '../../lib/outputs';
import type { SourcedBom, VendorOrder } from '../../lib/sourcing';
import { KvList, Muted } from '../detail/shared';
import { VEHICLE_LABEL, vendorOrders } from './packModel';

type Order = Initiation['orders'][number];
type DesignDoc = Initiation['designDocs'][number];

/** Created record link (after execution) or the state it will be created in. */
function Created({ id, to, pending }: { id?: string; to: string; pending: string }) {
  return id ? <Link to={to} style={{ fontSize: 'var(--vw-font-label-sm)', whiteSpace: 'nowrap' }}>{id}</Link> : <Muted size="xs">{pending}</Muted>;
}

export function InitiationView({ plan, init, sourced }: { plan: T.PlannerPlan; init: Initiation; sourced?: SourcedBom }) {
  const a = plan.artefacts;
  const executed = !!a || plan.status === 'Executing' || plan.status === 'Completed';
  const pending = executed ? 'Not created' : 'On approval';
  const programId = a?.programId ?? plan.programId;
  const instanceId = a?.processInstanceId ?? plan.processInstanceId;
  const isChange = init.vehicle === 'change';
  // Before execution: what sourcing would reserve. After: what was reserved.
  const stockReserved = a?.reservedDeviceIds?.length ?? 0;
  const racksReserved = a?.reservedRackIds?.length ?? 0;
  const stockCount = a ? stockReserved : sourced?.stockDeviceIds.length ?? 0;
  const rackCount = a ? racksReserved : sourced?.siteRackIds.length ?? 0;

  const phased = init.projects.some(p => p.planPhaseId && !p.shared) && new Set(init.projects.map(p => p.planPhaseId)).size > 1;
  const projectRows = useMemo(() => init.projects.map((p, i) => ({ ...p, id: `${p.uid ?? p.name}-${i}` })), [init.projects]);
  const projectCols: Col<InitProject & { id: string }>[] = useMemo(() => [
    { key: 'name', header: 'Project', wrap: true, render: r => <span className="row wrap" style={{ gap: 6 }}><span className="strong">{phased ? r.name.split(' — ').slice(-1)[0] : r.name}</span>{r.commissioning && <Chip tone="info" size="xs">Commissioning</Chip>}</span> },
    ...(phased ? [{ key: 'phase', header: 'Phase', render: (r: InitProject) => (r.shared ? <Chip tone="neutral" size="xs">Runs once</Chip> : r.phaseName ?? '—') }] : []),
    { key: 'start', header: 'Start', render: r => (r.late ? <Tooltip title="Back-scheduled from the phase go-live on blueprint durations, this project should already have started"><span className="num" style={{ color: 'var(--vw-color-red-600)', fontWeight: 600 }}>{fmtDate(r.start)}</span></Tooltip> : <span className="num">{fmtDate(r.start)}</span>) },
    { key: 'end', header: 'End', render: r => <span className="num">{fmtDate(r.end)}</span> },
    { key: 'budget', header: 'Budget', align: 'right', render: r => <Tooltip title={r.budgetBasis}><span className="num">{fmtUsd(r.budget)}</span></Tooltip> },
    { key: 'gate', header: 'Gate', wrap: true, render: r => <span className="row wrap" style={{ gap: 4 }}><Chip tone="neutral" size="xs">{r.gate}</Chip>{(r.gatedBy ?? []).map(x => <Tooltip key={x} title="Permit that must be approved before the project starts"><span><Chip tone="warning" size="xs">{x}</Chip></span></Tooltip>)}</span> },
    { key: 'll', header: 'Long lead', render: r => (r.longLead ? <Chip tone="warning" size="xs">Long-lead items</Chip> : null) },
    { key: 'rec', header: 'Record', render: r => { const id = r.uid ? a?.projectByUid?.[r.uid] : undefined; return <Created id={id} to={`/delivery/projects/${id ?? ''}`} pending={pending} />; } },
  ], [a, pending, phased]);
  const childRows = useMemo(() => (init.childPlans ?? []).map(c => ({ ...c, id: c.rowId })), [init.childPlans]);
  const childCols: Col<InitChildPlan & { id: string }>[] = useMemo(() => [
    { key: 'title', header: 'Child plan', render: r => <span className="strong">{r.title}</span> },
    { key: 'scope', header: 'Type', render: r => r.scope },
    { key: 'kw', header: 'IT capacity', align: 'right', render: r => <span className="num">{r.itKw.toLocaleString('en-US')} kW</span> },
    { key: 'live', header: 'Live', render: r => <span className="num">{fmtDate(r.goLive)}</span> },
    { key: 'budget', header: 'Budget envelope', align: 'right', render: r => <span className="num">{fmtUsd(r.budget)}</span> },
    { key: 'rec', header: 'Record', render: r => { const id = plan.sites?.find(x => x.id === r.rowId)?.childPlanId; return <Created id={id} to={`/planning/plans/${id ?? ''}`} pending={pending} />; } },
  ], [plan.sites, pending]);

  const orderRows = useMemo(() => init.orders.map((o, i) => ({ ...o, id: `${o.item}-${o.needBy}-${i}`, idx: i })), [init.orders]);
  const orderCols: Col<Order & { id: string; idx: number }>[] = useMemo(() => [
    { key: 'item', header: 'Item', render: r => <span className="strong">{r.item}</span> },
    { key: 'cat', header: 'Category', render: r => (r.category === 'Mixed' ? 'Several' : r.category) },
    { key: 'value', header: 'Value', align: 'right', render: r => <span className="num">{fmtUsd(r.value)}</span> },
    { key: 'ob', header: 'Order by', render: r => <span className="num" style={{ color: r.late ? 'var(--vw-color-red-600)' : undefined }}>{fmtDate(r.orderBy)}</span> },
    { key: 'nb', header: 'Need by', render: r => <span className="num">{fmtDate(r.needBy)}</span> },
    { key: 'late', header: 'Timing', render: r => (r.late ? <Chip tone="error" dot>Late</Chip> : <Chip tone="success" dot>On time</Chip>) },
    ...(sourced ? [] : [{ key: 'po', header: 'Purchase order', render: (r: Order & { idx: number }) => <Created id={a?.purchaseOrderIds[r.idx]} to="/procurement" pending={pending} /> }]),
  ], [a, pending, sourced]);

  const orders = useMemo(() => (sourced ? vendorOrders(sourced) : []), [sourced]);
  const vendorRows = useMemo(() => orders.map((o, i) => ({ ...o, id: `${o.vendorName}-${i}`, idx: i })), [orders]);
  const vendorCols: Col<VendorOrder & { id: string; idx: number }>[] = useMemo(() => [
    { key: 'vendor', header: 'Vendor', render: r => <span className="strong">{r.vendorName}</span> },
    { key: 'contract', header: 'Contract', render: r => (r.contractId ? r.contractLabel : <Chip tone="warning" size="xs">no contract</Chip>) },
    { key: 'lines', header: 'Lines', align: 'right', render: r => <span className="num">{r.lines.length}</span> },
    { key: 'value', header: 'Value', align: 'right', sort: r => r.value, render: r => <span className="num">{fmtUsd(r.value)}</span> },
    { key: 'lead', header: 'Longest lead', align: 'right', sort: r => r.leadWeeks, render: r => (r.leadWeeks ? <span className="num" style={r.leadWeeks >= 40 ? { color: 'var(--vw-color-red-600)', fontWeight: 600 } : undefined}>{r.leadWeeks} wk</span> : <span className="vw-label">—</span>) },
    { key: 'po', header: 'Purchase order', render: r => <Created id={a?.purchaseOrderIds[r.idx]} to="/procurement" pending={pending} /> },
  ], [a, pending]);

  const permitRows = useMemo(() => init.permits.map((p, i) => ({ ...p, idx: i })), [init.permits]);
  const permitCols: Col<T.PlannerPermit & { idx: number }>[] = useMemo(() => [
    { key: 'name', header: 'Permit', wrap: true, render: r => <span className="cell-2"><span className="strong">{r.name}</span><small>{r.authority}</small></span> },
    { key: 'lead', header: 'Lead time', align: 'right', render: r => <span className="num">{r.leadWeeks} wk</span> },
    { key: 'need', header: 'Needed before', render: r => <span className="num">{fmtDate(r.neededBefore)}</span> },
    { key: 'status', header: 'Status', render: r => <Chip tone={r.status === 'Approved' ? 'success' : r.status === 'Expired' ? 'error' : r.status === 'Not started' ? 'neutral' : 'info'} dot>{r.status}</Chip> },
    ...(init.permitGates?.length ? [{ key: 'gates', header: 'Gates', wrap: true, render: (r: T.PlannerPermit) => { const g: PermitGate | undefined = init.permitGates?.find(x => x.permit.id === r.id); return g?.projectName ? <Tooltip title={g.reason}><span className="row" style={{ gap: 6 }}><Chip tone={g.ok ? 'success' : 'error'} size="xs">{g.ok ? 'In time' : 'Late'}</Chip><span>{g.projectName.split(' — ').slice(-2).join(' — ')}</span></span></Tooltip> : <Tooltip title={g?.reason}><span className="vw-label">Not linked</span></Tooltip>; } }] : []),
    { key: 'rec', header: 'Record', render: r => <Created id={a?.permitIds[r.idx]} to="/delivery/permits" pending={pending} /> },
  ], [a, pending, init.permitGates]);

  const docRows = useMemo(() => init.designDocs.map((d, i) => ({ ...d, id: `${d.name}-${i}`, idx: i })), [init.designDocs]);
  const docCols: Col<DesignDoc & { id: string; idx: number }>[] = useMemo(() => [
    { key: 'name', header: 'Document', wrap: true, render: r => <span className="strong">{r.name}</span> },
    { key: 'type', header: 'Stage', render: r => r.type },
    { key: 'disc', header: 'Discipline', render: r => r.discipline },
    { key: 'rec', header: 'Record', render: r => <Created id={a?.designDocIds[r.idx]} to="/delivery/design" pending={pending} /> },
  ], [a, pending]);

  const vehicleItems: { label: ReactNode; value: ReactNode }[] = [
    { label: 'Created as', value: VEHICLE_LABEL[init.vehicle] },
    { label: 'Name', value: init.name },
    ...(isChange ? [] : [{ label: 'Blueprint', value: init.blueprintName ?? 'No blueprint for this plan type' }]),
    { label: 'Budget', value: fmtUsd(init.budget) },
    ...(init.budgetSplit?.length ? [{ label: 'Budget split', value: <span style={{ whiteSpace: 'normal' }}>{init.budgetSplit.map(b => `${b.category} ${fmtUsd(b.amount)}`).join(' · ')}</span> }] : []),
    ...(init.atps?.length ? [{ label: 'Acceptance tests', value: `${init.atps.length} (see Acceptance and handover)` }] : []),
    ...(init.workOrders?.length ? [{ label: 'Site work orders', value: `${init.workOrders.length}, one per site` }] : []),
    ...(isChange && init.change ? [{ label: 'Change type', value: init.change.type }] : []),
    { label: 'Record', value: isChange
      ? <Created id={a?.changeRequestId} to={`/changes?id=${encodeURIComponent(a?.changeRequestId ?? '')}`} pending={pending} />
      : <Created id={programId} to={`/delivery/programs/${programId ?? ''}`} pending={pending} /> },
  ];

  return (
    <div className="col" style={{ gap: 16 }}>
      {a && <div className="note note--info"><div>Created on {fmtDate(a.createdAt)}. Each line below links to the record it became.</div></div>}
      {!a && !executed && <div className="note note--info"><div>Nothing below exists yet. Approving and executing the plan creates these records with the figures shown.</div></div>}
      {!a && executed && <div className="note note--warn"><div>This plan was executed before build records were tracked; only the programme and work order are linked.</div></div>}
      <div className="grid g-2">
        <Panel icon={FolderKanban} title={isChange ? 'Change request' : VEHICLE_LABEL[init.vehicle]}>
          <KvList items={vehicleItems} />
        </Panel>
        <Panel icon={ClipboardList} title="Work order">
          <KvList items={[
            { label: 'Process', value: init.workOrder.process },
            { label: 'Starts', value: 'When the plan is executed' },
            { label: 'Record', value: <Created id={instanceId} to={`/workorders/instances/${instanceId ?? ''}`} pending={pending} /> },
          ]} />
        </Panel>
      </div>

      {(init.notes ?? []).map(n => <div key={n} className="note note--warn"><div>{n}</div></div>)}
      {init.vehicle === 'portfolio' && (
        <Panel flush icon={GitBranch} title="Child plans" count={(init.childPlans ?? []).length} actions={<Muted>one per allocation row</Muted>}>
          {childRows.length
            ? <DataTable rows={childRows} cols={childCols} pageSize={500} />
            : <Empty icon={GitBranch} title="No allocation yet">The child plans follow from the allocation rows.</Empty>}
        </Panel>
      )}
      {!isChange && init.vehicle !== 'portfolio' && (
        <Panel flush icon={Layers} title="Projects and gates" count={init.projects.length} actions={phased ? <Muted>one set per phase</Muted> : undefined}>
          {projectRows.length
            ? <DataTable rows={projectRows} cols={projectCols} pageSize={500} />
            : <Empty icon={Layers} title="No projects laid out">No blueprint matches this plan type, so no projects are laid out in advance.</Empty>}
        </Panel>
      )}

      {sourced && (
        <Panel flush icon={ShoppingCart} title="Purchase orders" count={orders.length} actions={<Muted>One per vendor · {fmtUsd(orders.reduce((s, o) => s + o.value, 0))}</Muted>}>
          {vendorRows.length
            ? <DataTable rows={vendorRows} cols={vendorCols} pageSize={500} />
            : <Empty icon={ShoppingCart} title="Nothing to buy">Everything comes from stock or spare site capacity; nothing needs to be bought.</Empty>}
        </Panel>
      )}

      {(sourced || stockReserved || racksReserved) && (
        <Panel icon={Boxes} title="Reserved from stock and site" actions={<Muted>{a ? 'Reserved on execution' : 'Reserved when the plan is executed'}</Muted>}>
          <KvList columns={2} items={[
            { label: 'Stock reserved', value: stockCount
              ? <span className="row wrap" style={{ gap: 8 }}>{stockCount} device{stockCount === 1 ? '' : 's'}{sourced ? ` · ${fmtUsd(sourced.stockValue)}` : ''}<Link to={stockReserved === 1 ? `/facility/devices/${a!.reservedDeviceIds![0]}` : '/facility/devices'}>{stockReserved === 1 ? a!.reservedDeviceIds![0] : 'Device list'}</Link></span>
              : <Muted>{a ? 'None reserved' : 'Nothing in stock matches'}</Muted> },
            ...(rackCount ? [{ label: 'Rack positions reserved', value: <span className="row wrap" style={{ gap: 8 }}>{rackCount} position{rackCount === 1 ? '' : 's'}<Link to={racksReserved === 1 ? `/facility/racks/${a!.reservedRackIds![0]}` : '/facility/racks'}>{racksReserved === 1 ? a!.reservedRackIds![0] : 'Rack list'}</Link></span> }] : []),
          ]} />
        </Panel>
      )}

      <Panel flush icon={PackageCheck} title={sourced ? 'Long-lead items to order' : 'Long-lead purchase orders'} count={init.orders.length} actions={<Muted>{init.orders.filter(o => o.late).length} late to order</Muted>}>
        {orderRows.length
          ? <DataTable rows={orderRows} cols={orderCols} pageSize={500} />
          : <Empty icon={PackageCheck} title="No long-lead equipment">No long-lead equipment in this plan.</Empty>}
      </Panel>

      <div className="grid g-2">
        <Panel flush icon={Stamp} title="Permits to file" count={init.permits.length}>
          {permitRows.length
            ? <DataTable rows={permitRows} cols={permitCols} pageSize={500} />
            : <Empty icon={Stamp} title="No permits">No permits are listed for this plan.</Empty>}
        </Panel>
        <Panel flush icon={FileStack} title="Design documents to create" count={init.designDocs.length}>
          <DataTable rows={docRows} cols={docCols} pageSize={500} empty={<Empty icon={FileText} title="No design documents" />} />
        </Panel>
      </div>
    </div>
  );
}
