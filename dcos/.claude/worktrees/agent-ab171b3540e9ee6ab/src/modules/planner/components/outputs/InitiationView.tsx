/* Build initiation: what approval creates — the delivery vehicle, its projects, purchase orders per vendor, reserved stock and rack positions, permits, design documents and the work order. */
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import type * as T from '../../../../mock/data/types';
import { VwCard, VwChip, fmtDate } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { fmtUsd } from '../../lib/engine';
import type { Initiation, InitProject } from '../../lib/outputs';
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

  const projectCols: ColumnsType<InitProject> = useMemo(() => [
    { title: 'Project', dataIndex: 'name', key: 'name', render: (t: string) => <span style={{ whiteSpace: 'normal', fontWeight: 500 }}>{t}</span> },
    { title: 'Start', dataIndex: 'start', key: 'start', render: (d: string) => fmtDate(d) },
    { title: 'End', dataIndex: 'end', key: 'end', render: (d: string) => fmtDate(d) },
    { title: 'Budget', dataIndex: 'budget', key: 'budget', align: 'right', render: (n: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(n)}</span> },
    { title: 'Gate', dataIndex: 'gate', key: 'gate', render: (g: string) => <VwChip variant="neutral">{g}</VwChip> },
    { title: 'Long lead', dataIndex: 'longLead', key: 'll', render: (b: boolean) => (b ? <VwChip variant="warning">Long-lead items</VwChip> : null) },
  ], []);

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
    { title: 'Record', key: 'rec', render: (_: unknown, _r, i) => <Created id={a?.permitIds[i]} to="/delivery/permits" pending={pending} /> },
  ], [a, pending]);

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

      {!isChange && (
        <VwCard title="Projects and gates" extra={<Muted>{init.projects.length} project{init.projects.length === 1 ? '' : 's'}</Muted>}>
          {init.projects.length
            ? <Table<InitProject> size="small" rowKey="name" dataSource={init.projects} columns={projectCols} pagination={false} scroll={{ x: 760 }} />
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
