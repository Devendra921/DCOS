import { Link } from 'react-router-dom';
import { PackageSearch } from 'lucide-react';
import { fmtDateTime } from '../../../shared/components/ux';
import { Chip, Empty, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { ChangeRequest, Device, MaterialEvent, WorkOrder } from '../../../mock/data/types';
import type { MaterialEventKind } from '../../../mock/data/enums';
import { useMaterialData } from '../../delivery/lib/materialHooks';
import { eventsOfDevice } from '../../delivery/lib/materialRules';

const KIND_TONE: Partial<Record<MaterialEventKind, 'success' | 'info' | 'warning' | 'error' | 'neutral'>> = {
  Received: 'info', 'Delivered to site': 'info', Issued: 'info', Installed: 'success', Removed: 'warning', Returned: 'neutral', Faulty: 'error', 'RMA raised': 'error', Cancelled: 'neutral',
};

/** The unit's material history: received, delivered, installed or removed by which work order under which change, returned or sent back by RMA. */
export function DeviceMaterialHistory({ device }: { device: Device }) {
  const m = useMaterialData();
  const workOrders = (useEntityList('workOrders', { pageSize: 100000 }).data?.data ?? []) as unknown as WorkOrder[];
  const changes = (useEntityList('changeRequests', { pageSize: 100000 }).data?.data ?? []) as unknown as ChangeRequest[];
  const events = [...eventsOfDevice(m, device.id)].reverse();
  const wo = (id?: string) => (id ? workOrders.find((w) => w.id === id) : undefined);
  const ch = (id?: string) => (id ? changes.find((c) => c.id === id) : undefined);
  const installedBy = wo(device.installedByWorkOrderId);
  const removedBy = wo(device.removedByWorkOrderId);

  const cols: Col<MaterialEvent>[] = [
    { key: 'at', header: 'When', sort: (e) => e.at, render: (e) => <span className="num">{fmtDateTime(e.at)}</span> },
    { key: 'kind', header: 'What', render: (e) => <Chip tone={KIND_TONE[e.kind] ?? 'neutral'} dot>{e.kind}</Chip> },
    { key: 'serial', header: 'Serial', render: (e) => <span className="mono">{e.serial ?? device.serial ?? '—'}</span> },
    { key: 'wo', header: 'Work order', render: (e) => { const w = wo(e.workOrderId); return w ? <Link className="ent-link" to={`/delivery/work-orders/${w.id}`}>{w.woId}</Link> : <span className="muted">—</span>; } },
    { key: 'ch', header: 'Change', render: (e) => { const c = ch(e.changeRequestId ?? wo(e.workOrderId)?.changeRequestId); return c ? <Link className="ent-link" to={`/changes/${c.id}`}>{c.chgId ?? c.id}</Link> : <span className="muted">—</span>; } },
    { key: 'src', header: 'From', render: (e) => e.source },
    { key: 'by', header: 'By', render: (e) => e.by },
    { key: 'note', header: 'Note', wrap: true, render: (e) => e.note ?? '' },
  ];

  return (
    <Panel title="Material history" icon={PackageSearch} count={events.length} flush
      sub={<>
        {installedBy ? <>Installed by <Link className="ent-link" to={`/delivery/work-orders/${installedBy.id}`}>{installedBy.woId}</Link></> : 'Newest first'}
        {removedBy ? <> · removed by <Link className="ent-link" to={`/delivery/work-orders/${removedBy.id}`}>{removedBy.woId}</Link></> : null}
      </>}>
      <DataTable rows={events} cols={cols} pageSize={Math.max(events.length, 1)}
        empty={<Empty icon={PackageSearch} title="No material events for this unit">Receipts, installs, removals and returns recorded on work orders appear here.</Empty>} />
    </Panel>
  );
}
export default DeviceMaterialHistory;
