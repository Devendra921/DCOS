/* Build initiation: what approval creates — the delivery vehicle, its projects, purchase orders per vendor, reserved stock and rack positions, permits, design documents and the work order. */
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import type * as T from '../../../../mock/data/types';
import { Tooltip } from 'antd';
import { VwCard, VwChip, fmtDate } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
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
  const projectCols: ColumnsType<InitProject> = useMemo(() => [
    { title: 'Project', dataIndex: 'name', key: 'name', render: (t: string, r) => <span style={{ whiteSpace: 'normal', fontWeight: 500 }}>{phased ? t.split(' — ').slice(-1)[0] : t}{r.commissioning && <VwChip variant="info" style={{ marginLeft: 6 }}>Commissioning</VwChip>}</span> },
    ...(phased ? [{ title: 'Phase', key: 'phase', render: (_: unknown, r: InitProject) => (r.shared ? <VwChip variant="neutral">Runs once</VwChip> : r.phaseName ?? '—') }] : []),
    { title: 'Start', dataIndex: 'start', key: 'start', render: (d: string, r) => (r.late ? <Tooltip title="Back-scheduled from the phase go-live on blueprint durations, this project should already have started"><span style={{ color: 'var(--vw-color-red-600)', fontWeight: 600 }}>{fmtDate(d)}</span></Tooltip> : fmtDate(d)) },
    { title: 'End', dataIndex: 'end', key: 'end', render: (d: string) => fmtDate(d) },
    { title: 'Budget', dataIndex: 'budget', key: 'budget', align: 'right', render: (n: number, r) => <Tooltip title={r.budgetBasis}><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(n)}</span></Tooltip> },
    { title: 'Gate', dataIndex: 'gate', key: 'gate', render: (g: string, r) => <span className="vw-flex vw-gap-xs vw-wrap"><VwChip variant="neutral">{g}</VwChip>{(r.gatedBy ?? []).map(x => <Tooltip key={x} title="Permit that must be approved before the project starts"><VwChip variant="warning">{x}</VwChip></Tooltip>)}</span> },
    { title: 'Long lead', dataIndex: 'longLead', key: 'll', render: (b: boolean) => (b ? <VwChip variant="warning">Long-lead items</VwChip> : null) },
    { title: 'Record', key: 'rec', render: (_: unknown, r) => { const id = r.uid ? a?.projectByUid?.[r.uid] : undefined; return <Created id={id} to={`/delivery/projects/${id ?? ''}`} pending={pending} />; } },
  ], [a, pending, phased]);
  const childCols: ColumnsType<InitChildPlan> = useMemo(() => [
    { title: 'Child plan', dataIndex: 'title', key: 'title', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Type', dataIndex: 'scope', key: 'scope' },
    { title: 'IT capacity', dataIndex: 'itKw', key: 'kw', align: 'right', render: (n: number) => `${n.toLocaleString('en-US')} kW` },
    { title: 'Live', dataIndex: 'goLive', key: 'live', render: (d: string) => fmtDate(d) },
    { title: 'Budget envelope', dataIndex: 'budget', key: 'budget', align: 'right', render: (n: number) => fmtUsd(n) },
    { title: 'Record', key: 'rec', render: (_: unknown, r) => { const id = plan.sites?.find(x => x.id === r.rowId)?.childPlanId; return <Created id={id} to={`/planning/plans/${id ?? ''}`} pending={pending} />; } },
  ], [plan.sites, pending]);

  const orderCols: ColumnsType<Order> = useMemo(() => [
    { title: 'Item', dataIndex: 'item', key: 'item', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Category', dataIndex: 'category', key: 'cat', render: (c: string) => (c === 'Mixed' ? 'Several' : c) },
    { title: 'Value', dataIndex: 'value', key: 'value', align: 'right', render: (n: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(n)}</span> },
    { title: 'Order by', dataIndex: 'orderBy', key: 'ob', render: (d: string, r) => <span style={{ color: r.late ? 'var(--vw-color-red-600)' : undefined }}>{fmtDate(d)}</span> },
    { title: 'Need by', dataIndex: 'needBy', key: 'nb', render: (d: string) => fmtDate(d) },
    { title: 'Timing', dataIndex: 'late', key: 'late', render: (late: boolean) => (late ? <VwChip variant="error">Late</VwChip> : <VwChip variant="success">On time</VwChip>) },
    ...(sourced ? [] : [{ title: 'Purchase order', key: 'po', render: (_: unknown, _r: Order, i: number) => <Created id={a?.purchaseOrderIds[i]} to="/procurement" pending={pending} /> }]),
  ], [a, pending, sourced]);

  const orders = useMemo(() => (sourced ? vendorOrders(sourced) : []), [sourced]);
  const vendorCols: ColumnsType<VendorOrder> = useMemo(() => [
    { title: 'Vendor', dataIndex: 'vendorName', key: 'vendor', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Contract', key: 'contract', render: (_: unknown, r) => (r.contractId ? r.contractLabel : <VwChip variant="warning">no contract</VwChip>) },
    { title: 'Lines', key: 'lines', align: 'right', render: (_: unknown, r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.lines.length}</span> },
    { title: 'Value', dataIndex: 'value', key: 'value', align: 'right', sorter: (x, y) => x.value - y.value, render: (n: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(n)}</span> },
    { title: 'Longest lead', dataIndex: 'leadWeeks', key: 'lead', align: 'right', sorter: (x, y) => x.leadWeeks - y.leadWeeks, render: (w: number) => (w ? <span style={{ color: w >= 40 ? 'var(--vw-color-red-600)' : undefined, fontWeight: w >= 40 ? 600 : undefined }}>{w} wk</span> : <span style={{ color: 'var(--vw-color-slate-400)' }}>—</span>) },
    { title: 'Purchase order', key: 'po', render: (_: unknown, _r, i) => <Created id={a?.purchaseOrderIds[i]} to="/procurement" pending={pending} /> },
  ], [a, pending]);

  const permitCols: ColumnsType<T.PlannerPermit> = useMemo(() => [
    { title: 'Permit', dataIndex: 'name', key: 'name', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Authority', dataIndex: 'authority', key: 'auth' },
    { title: 'Lead time', dataIndex: 'leadWeeks', key: 'lead', align: 'right', render: (w: number) => `${w} wk` },
    { title: 'Needed before', dataIndex: 'neededBefore', key: 'need', render: (d: string) => fmtDate(d) },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <VwChip variant={s === 'Approved' ? 'success' : s === 'Expired' ? 'error' : s === 'Not started' ? 'neutral' : 'info'}>{s}</VwChip> },
    ...(init.permitGates?.length ? [{ title: 'Gates', key: 'gates', render: (_: unknown, r: T.PlannerPermit) => { const g: PermitGate | undefined = init.permitGates?.find(x => x.permit.id === r.id); return g?.projectName ? <Tooltip title={g.reason}><span className="vw-inline-flex vw-items-center vw-gap-xs"><VwChip variant={g.ok ? 'success' : 'error'}>{g.ok ? 'In time' : 'Late'}</VwChip><span style={{ whiteSpace: 'normal' }}>{g.projectName.split(' — ').slice(-2).join(' — ')}</span></span></Tooltip> : <Tooltip title={g?.reason}><span style={{ color: 'var(--vw-color-slate-500)' }}>Not linked</span></Tooltip>; } }] : []),
    { title: 'Record', key: 'rec', render: (_: unknown, _r: T.PlannerPermit, i: number) => <Created id={a?.permitIds[i]} to="/delivery/permits" pending={pending} /> },
  ], [a, pending, init.permitGates]);

  const docCols: ColumnsType<DesignDoc> = useMemo(() => [
    { title: 'Document', dataIndex: 'name', key: 'name', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Stage', dataIndex: 'type', key: 'type' },
    { title: 'Discipline', dataIndex: 'discipline', key: 'disc' },
    { title: 'Record', key: 'rec', render: (_: unknown, _r, i) => <Created id={a?.designDocIds[i]} to="/delivery/design" pending={pending} /> },
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
    <div className="vw-flex vw-flex-col vw-gap-md">
      {a && <div className="vw-card-description">Created on {fmtDate(a.createdAt)}. Each line below links to the record it became.</div>}
      {!a && !executed && <div className="vw-card-description">Nothing below exists yet. Approving and executing the plan creates these records with the figures shown.</div>}
      {!a && executed && <div className="vw-card-description">This plan was executed before build records were tracked; only the programme and work order are linked.</div>}
      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <VwCard title={isChange ? 'Change request' : VEHICLE_LABEL[init.vehicle]}>
          <KvList items={vehicleItems} />
        </VwCard>
        <VwCard title="Work order">
          <KvList items={[
            { label: 'Process', value: init.workOrder.process },
            { label: 'Starts', value: 'When the plan is executed' },
            { label: 'Record', value: <Created id={instanceId} to={`/workorders/instances/${instanceId ?? ''}`} pending={pending} /> },
          ]} />
        </VwCard>
      </div>

      {(init.notes ?? []).map(n => <div key={n} className="vw-card-description" style={{ color: 'var(--vw-color-amber-700)' }}>{n}</div>)}
      {init.vehicle === 'portfolio' && (
        <VwCard title="Child plans" extra={<Muted>{(init.childPlans ?? []).length} · one per allocation row</Muted>}>
          {(init.childPlans ?? []).length
            ? <Table<InitChildPlan> size="small" rowKey="rowId" dataSource={init.childPlans} columns={childCols} pagination={false} scroll={{ x: 760 }} />
            : <div className="vw-card-description">No allocation yet: the child plans follow from the allocation rows.</div>}
        </VwCard>
      )}
      {!isChange && init.vehicle !== 'portfolio' && (
        <VwCard title="Projects and gates" extra={<Muted>{init.projects.length} project{init.projects.length === 1 ? '' : 's'}{phased ? ', one set per phase' : ''}</Muted>}>
          {init.projects.length
            ? <Table<InitProject> size="small" rowKey={r => r.uid ?? r.name} dataSource={init.projects} columns={projectCols} pagination={false} scroll={{ x: 980 }} />
            : <div className="vw-card-description">No blueprint matches this plan type, so no projects are laid out in advance.</div>}
        </VwCard>
      )}

      {sourced && (
        <VwCard title="Purchase orders" extra={<Muted>One per vendor · {fmtUsd(orders.reduce((s, o) => s + o.value, 0))}</Muted>}>
          {orders.length
            ? <Table<VendorOrder> size="small" rowKey="vendorName" dataSource={orders} columns={vendorCols} pagination={false} scroll={{ x: 760 }} />
            : <div className="vw-card-description">Everything comes from stock or spare site capacity; nothing needs to be bought.</div>}
        </VwCard>
      )}

      {(sourced || stockReserved || racksReserved) && (
        <VwCard title="Reserved from stock and site" extra={<Muted>{a ? 'Reserved on execution' : 'Reserved when the plan is executed'}</Muted>}>
          <KvList columns={2} items={[
            { label: 'Stock reserved', value: stockCount
              ? <span className="vw-inline-flex vw-items-center vw-gap-sm">{stockCount} device{stockCount === 1 ? '' : 's'}{sourced ? ` · ${fmtUsd(sourced.stockValue)}` : ''}<Link to={stockReserved === 1 ? `/facility/devices/${a!.reservedDeviceIds![0]}` : '/facility/devices'} style={{ fontSize: 'var(--vw-font-label-sm)' }}>{stockReserved === 1 ? a!.reservedDeviceIds![0] : 'Device list'}</Link></span>
              : <Muted>{a ? 'None reserved' : 'Nothing in stock matches'}</Muted> },
            ...(rackCount ? [{ label: 'Rack positions reserved', value: <span className="vw-inline-flex vw-items-center vw-gap-sm">{rackCount} position{rackCount === 1 ? '' : 's'}<Link to={racksReserved === 1 ? `/facility/racks/${a!.reservedRackIds![0]}` : '/facility/racks'} style={{ fontSize: 'var(--vw-font-label-sm)' }}>{racksReserved === 1 ? a!.reservedRackIds![0] : 'Rack list'}</Link></span> }] : []),
          ]} />
        </VwCard>
      )}

      <VwCard title={sourced ? 'Long-lead items to order' : 'Long-lead purchase orders'} extra={<Muted>{init.orders.filter(o => o.late).length} late to order</Muted>}>
        {init.orders.length
          ? <Table<Order> size="small" rowKey={r => `${r.item}-${r.needBy}`} dataSource={init.orders} columns={orderCols} pagination={false} scroll={{ x: 760 }} />
          : <div className="vw-card-description">No long-lead equipment in this plan.</div>}
      </VwCard>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
        <VwCard title="Permits to file">
          {init.permits.length
            ? <Table<T.PlannerPermit> size="small" rowKey="id" dataSource={init.permits} columns={permitCols} pagination={false} scroll={{ x: 620 }} />
            : <div className="vw-card-description">No permits are listed for this plan.</div>}
        </VwCard>
        <VwCard title="Design documents to create">
          <Table<DesignDoc> size="small" rowKey="name" dataSource={init.designDocs} columns={docCols} pagination={false} />
        </VwCard>
      </div>
    </div>
  );
}
