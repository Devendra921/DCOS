/* Work order: the one work order this change authorises: who does it (own technician or a contractor
   with its crew), its status, dates and sign-off. */
import { Link } from 'react-router-dom';
import { VwCard } from '../../../../shared/components/ux';
import { WO_TYPE_LABEL, fmtWhen, siteLabel } from '../../lib/model';
import { KvList, Muted, WoStatusChip } from '../kit';
import type { ChangeView } from './shared';

export function WorkOrderTab({ v }: { v: ChangeView }) {
  const wo = v.ch.workOrder;
  if (!wo) {
    return (
      <VwCard title="Work order">
        <div className="vw-card-description">This change has no work order. It was recorded before every change came with its work order; the work is tracked on the change itself. New changes raised from <Link to="/changes/new">Raise a change</Link> create their work order together with the change.</div>
      </VwCard>
    );
  }
  const vendor = wo.contractorVendorId ? v.d.vendors.find(x => x.id === wo.contractorVendorId) : undefined;
  const site = v.d.dataCenters.find(s => s.id === wo.dataCenterId);
  return (
    <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
      <VwCard title={`${wo.woId ?? wo.id}${wo.title ? ` · ${wo.title}` : ''}`} extra={<Link to={`/delivery/work-orders/${wo.id}`} className="nst-btn nst-btn--action nst-btn--sm">Open work order</Link>}>
        <KvList items={[
          { label: 'Status', value: <WoStatusChip status={wo.status} /> },
          { label: 'Type', value: WO_TYPE_LABEL[wo.type] ?? wo.type },
          { label: 'Site', value: site ? `${siteLabel(site)} · ${site.name}` : '—' },
          { label: 'Priority', value: wo.priority ?? '—' },
          { label: 'Planned', value: wo.plannedStart ? `${fmtWhen(wo.plannedStart)} to ${fmtWhen(wo.plannedEnd)}` : wo.scheduledDate ? fmtWhen(wo.scheduledDate) : '—' },
          { label: 'Actual', value: wo.actualStart ? `${fmtWhen(wo.actualStart)}${wo.actualEnd ? ` to ${fmtWhen(wo.actualEnd)}` : ' (in progress)'}` : 'Not started' },
          { label: 'Description', value: wo.description || '—' },
        ]} />
      </VwCard>
      <div className="vw-flex vw-flex-col vw-gap-md">
        <VwCard title="Who does the work">
          <KvList items={[
            { label: 'Assigned to', value: wo.assigneeKind === 'contractor' ? `Contractor${vendor ? `: ${vendor.name}` : ''}` : 'Own technicians' },
            { label: wo.assigneeKind === 'contractor' ? 'Lead' : 'Technician', value: wo.assigneeName || <Muted>Not assigned yet</Muted> },
            { label: 'Crew', value: wo.crew?.length ? wo.crew.join(', ') : <Muted>No crew recorded</Muted> },
            ...(wo.assigneeKind === 'contractor' ? [{ label: 'Site access request', value: wo.accessRequestId ?? <Muted>Not raised yet. Contractors need a site access request (P12) before they arrive.</Muted> }] : []),
          ]} />
        </VwCard>
        <VwCard title="Sign-off">
          {wo.signOff ? <KvList items={[
            { label: 'Signed off by', value: wo.signOff.by },
            { label: 'When', value: fmtWhen(wo.signOff.at) },
            { label: 'Customer witness', value: wo.signOff.customerWitness ?? '—' },
            { label: 'Notes', value: wo.signOff.notes ?? '—' },
          ]} /> : <div className="vw-card-description">Not signed off yet. The work order is signed off when the work is completed; the change then becomes Implemented.</div>}
        </VwCard>
      </div>
    </div>
  );
}
