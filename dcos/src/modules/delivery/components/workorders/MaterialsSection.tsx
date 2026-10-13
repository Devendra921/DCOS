/* Materials of a work order (shown on the Execution tab): the shared materials workspace with the
   crew's steps (confirm the kit, record serials and quantities, return parts). The change page shows
   the same workspace on its Materials tab; both edit the same lines. Readiness and availability are
   warnings only. Writes go through useMaterialActions() only. */
import { MaterialsWorkspace } from './MaterialsWorkspace';
import type { WorkOrderView } from './view';

export function MaterialsSection({ v }: { v: WorkOrderView }) {
  const wo = v.row.wo;
  const rackIds = wo.rackIds ?? (wo.rackId ? [wo.rackId] : []);
  return <MaterialsWorkspace wo={wo} change={v.row.change} lines={v.materialLines} siteId={v.row.siteId} rackIds={rackIds} needBy={v.row.start} where="workOrder" />;
}
