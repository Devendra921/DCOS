/* Work order: the one work order this change authorises: who does it (own technician or a contractor
   with its crew), its status, dates, kit status and sign-off. */
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, ExternalLink, HardHat, PenLine } from 'lucide-react';
import { Btn, Panel } from '../../../../ops/ui/kit';
import { WO_TYPE_LABEL, fmtWhen, siteLabel } from '../../lib/model';
import { KvList, Muted, WoStatusChip } from '../kit';
import type { ChangeView } from './shared';
import { ReadinessChip } from '../../../delivery/components/workorders/materials';

export function WorkOrderTab({ v }: { v: ChangeView }) {
  const navigate = useNavigate();
  const wo = v.ch.workOrder;
  if (!wo) {
    return (
      <Panel title="Work order" icon={ClipboardList}>
        <p className="vw-label" style={{ margin: 0 }}>This change has no work order. It was recorded before every change came with its work order; the work is tracked on the change itself. New changes raised from <Link to="/changes/new">Raise a change</Link> create their work order together with the change.</p>
      </Panel>
    );
  }
  const vendor = wo.contractorVendorId ? v.d.vendors.find(x => x.id === wo.contractorVendorId) : undefined;
  const site = v.d.dataCenters.find(s => s.id === wo.dataCenterId);
  return (
    <div className="grid g-2">
      <Panel title={`${wo.woId ?? wo.id}${wo.title ? ` · ${wo.title}` : ''}`} icon={ClipboardList} actions={<Btn size="sm" variant="action" icon={ExternalLink} onClick={() => navigate(`/delivery/work-orders/${wo.id}`)}>Open work order</Btn>}>
        <KvList columns={2} items={[
          { label: 'Status', value: <WoStatusChip status={wo.status} /> },
          { label: 'Type', value: WO_TYPE_LABEL[wo.type] ?? wo.type },
          { label: 'Site', value: site ? `${siteLabel(site)} · ${site.name}` : '—' },
          { label: 'Priority', value: wo.priority ?? '—' },
          { label: 'Planned', value: wo.plannedStart ? `${fmtWhen(wo.plannedStart)} to ${fmtWhen(wo.plannedEnd)}` : wo.scheduledDate ? fmtWhen(wo.scheduledDate) : '—' },
          { label: 'Actual', value: wo.actualStart ? `${fmtWhen(wo.actualStart)}${wo.actualEnd ? ` to ${fmtWhen(wo.actualEnd)}` : ' (in progress)'}` : 'Not started' },
          { label: 'Kit', value: v.materials.kit.state === 'Not needed' ? (v.materials.lines.length ? 'Nothing goes in; parts come out only' : 'No materials') : (
            <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}><ReadinessChip r={v.materials.kit} />{v.materials.kit.reasons.length ? <Muted>{v.materials.kit.reasons.join('; ')}</Muted> : null}</span>
          ) },
          { label: 'Materials recorded', value: wo.materialsRecordedAt ? `${fmtWhen(wo.materialsRecordedAt)}${wo.materialsRecordedBy ? ` by ${wo.materialsRecordedBy}` : ''}` : v.materials.lines.length ? 'Not yet' : '—' },
          { label: 'Description', value: wo.description || '—' },
        ]} />
      </Panel>
      <div className="col" style={{ gap: 18 }}>
        <Panel title="Who does the work" icon={HardHat}>
          <KvList items={[
            { label: 'Assigned to', value: wo.assigneeKind === 'contractor' ? `Contractor${vendor ? `: ${vendor.name}` : ''}` : 'Own technicians' },
            { label: wo.assigneeKind === 'contractor' ? 'Lead' : 'Technician', value: wo.assigneeName || <Muted>Not assigned yet</Muted> },
            { label: 'Crew', value: wo.crew?.length ? wo.crew.join(', ') : <Muted>No crew recorded</Muted> },
            ...(wo.assigneeKind === 'contractor' ? [{ label: 'Site access request', value: wo.accessRequestId ?? <Muted>Not raised yet. Contractors need a site access request (P12) before they arrive.</Muted> }] : []),
          ]} />
        </Panel>
        <Panel title="Sign-off" icon={PenLine}>
          {wo.signOff ? <KvList items={[
            { label: 'Work done by', value: wo.signOff.performedBy ?? wo.assigneeName ?? '—' }, { label: 'Confirmed by', value: wo.signOff.by },
            { label: 'When', value: fmtWhen(wo.signOff.at) },
            { label: 'Customer witness', value: wo.signOff.customerWitness ?? '—' },
            { label: 'Notes', value: wo.signOff.notes ?? '—' },
          ]} /> : <p className="vw-label" style={{ margin: 0 }}>Not signed off yet. The work order is signed off when the work is completed; the change then becomes Implemented.</p>}
        </Panel>
      </div>
    </div>
  );
}
