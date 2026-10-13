/* Materials: the change's materials, managed here as on its work order (one change per work order,
   so both pages edit the same lines): required items and their availability, reservation and kit;
   retired equipment with its disposition and sanitisation; spares and consumption; the requests to
   the supply chain platform and the history. Advisory: nothing here blocks approval or the work. */
import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { Panel } from '../../../../ops/ui/kit';
import { MaterialsWorkspace } from '../../../delivery/components/workorders/MaterialsWorkspace';
import type { ChangeView } from './shared';

export function MaterialsTab({ v }: { v: ChangeView }) {
  const { c, ch, row, rackIds } = v;
  const wo = ch.workOrder;
  if (!wo) {
    return (
      <Panel title="Materials" icon={Package}>
        <p className="vw-label" style={{ margin: 0 }}>The materials of a change are kept on its work order, and this change has none. Facility or configuration work with no work order needs no materials here; raise the work as a change with a work order (<Link to="/changes/new">Raise a change</Link>) when parts go in or equipment comes out.</p>
      </Panel>
    );
  }
  return <MaterialsWorkspace wo={wo} change={c} lines={v.materials.lines} siteId={wo.dataCenterId ?? row.site?.id} rackIds={wo.rackIds ?? (wo.rackId ? [wo.rackId] : rackIds)} needBy={row.start} where="change" />;
}
