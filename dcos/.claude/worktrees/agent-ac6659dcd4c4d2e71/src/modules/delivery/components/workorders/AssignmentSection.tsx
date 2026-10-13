/* Assignment: an own technician from the people list, or a contractor company from the vendor
   list with its crew. Contractor crews need a site access request (P12) before they arrive. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Select } from 'antd';
import { VwCard, VwChip, VwSegmented } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { PEOPLE } from '../../../../mock/db/seed/ctx';
import { useEngineActions } from '../../../workorders/lib/useWorkflows';
import { KvList, Muted } from '../home/kit';
import { fmtDateTime, fmtWindow } from './model';
import type { WorkOrderView } from './view';

const TECH_ROLES = ['Field Technician', 'Site Technician', 'Facilities Engineer', 'Network Engineer', 'Commissioning Engineer'];
/** Vendor categories in the order a contractor is usually chosen (installers and services first). */
const CONTRACTOR_ORDER = ['Services', 'Power', 'Cooling', 'Network', 'Hardware'];
const ASSIGNABLE = ['Draft', 'Awaiting change approval', 'Ready', 'Assigned'];

export function AssignmentSection({ v }: { v: WorkOrderView }) {
  const { row, actions } = v; const wo = row.wo;
  const { message } = App.useApp();
  const engine = useEngineActions();
  const [kind, setKind] = useState<'internal' | 'contractor'>(wo.assigneeKind ?? 'internal');
  const [name, setName] = useState<string | undefined>(wo.assigneeKind !== 'contractor' ? wo.assigneeName || undefined : undefined);
  const [vendorId, setVendorId] = useState<string | undefined>(wo.contractorVendorId);
  const [crew, setCrew] = useState<string[]>(wo.crew ?? []);
  const [starting, setStarting] = useState(false);
  const editable = ASSIGNABLE.includes(wo.status);
  const techs = PEOPLE.filter(p => TECH_ROLES.includes(p.role));
  const vendors = v.d.vendors.filter(x => x.status !== 'Inactive' && x.category !== 'Property');
  const vendorGroups = CONTRACTOR_ORDER.map(cat => ({ label: cat, options: vendors.filter(x => x.category === cat).map(x => ({ value: x.id, label: x.name })) }))
    .concat([{ label: 'Other', options: vendors.filter(x => !CONTRACTOR_ORDER.includes(x.category)).map(x => ({ value: x.id, label: x.name })) }]).filter(g => g.options.length);
  const vendor = v.d.vendors.find(x => x.id === wo.contractorVendorId);
  const valid = kind === 'internal' ? !!name : !!vendorId && crew.length > 0;
  const dirty = kind !== (wo.assigneeKind ?? 'internal') || (kind === 'internal' ? name !== wo.assigneeName : vendorId !== wo.contractorVendorId || crew.join('|') !== (wo.crew ?? []).join('|'));

  const save = () => {
    actions.assignWorkOrder(wo.id, kind === 'internal' ? { kind, name } : { kind, vendorId, name: crew[0], crew });
    message.success(kind === 'internal' ? `${name} assigned` : `${vendors.find(x => x.id === vendorId)?.name} assigned with a crew of ${crew.length}`);
  };

  const requestAccess = async () => {
    if (!row.siteId) return;
    setStarting(true);
    try {
      const inst = await engine.startInstance('access-request', `${wo.woId ?? wo.id}-ACCESS`, {
        recordType: 'dataCenter', recordId: row.siteId, dataCenterId: row.siteId,
        title: `${vendor?.name ?? 'Contractor'} crew for ${wo.woId ?? wo.id}: ${row.title}`,
        variables: { workOrderId: wo.id, contractorVendorId: wo.contractorVendorId, crew: wo.crew ?? [], visitStart: row.start, visitEnd: row.end, zones: v.rackNames },
      });
      message.success(`Access request ${inst.id} started; the visit request is now in the task inbox`);
    } catch (e) { message.error((e as Error).message); } finally { setStarting(false); }
  };

  const needsNewAccess = !v.access || ['Denied', 'Cancelled'].includes(v.accessState?.label ?? '');
  return (
    <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 420px)', alignItems: 'start' }}>
      <VwCard title="Who does the work">
        <div className="vw-flex vw-flex-col vw-gap-md">
          <KvList columns={2} items={[
            { label: 'Assigned to', value: row.assignee },
            { label: 'Kind', value: wo.assigneeKind === 'contractor' ? 'Contractor company' : 'Own technician' },
            ...(wo.crew?.length ? [{ label: 'Crew', value: wo.crew.join(', ') }] : []),
            ...(vendor ? [{ label: 'Contractor contact', value: `${vendor.contactName} · ${vendor.category}` }] : []),
          ]} />
          {!editable
            ? <div className="vw-card-description">The assignment is fixed once the work has started ({wo.status === 'InProgress' ? 'in progress' : wo.status.toLowerCase()}).</div>
            : (
              <div className="vw-flex vw-flex-col vw-gap-sm">
                <VwSegmented value={kind} onChange={k => setKind(k as 'internal' | 'contractor')} options={[{ label: 'Own technician', value: 'internal' }, { label: 'Contractor company', value: 'contractor' }]} />
                {kind === 'internal' ? (
                  <Select showSearch optionFilterProp="label" placeholder="Choose a technician" value={name} onChange={setName} style={{ maxWidth: 420 }} aria-label="Technician"
                    options={techs.map(p => ({ value: p.name, label: `${p.name} · ${p.role}${p.site ? ` · ${p.site}` : ''}` }))} />
                ) : (
                  <>
                    <Select showSearch optionFilterProp="label" placeholder="Choose a contractor company" value={vendorId} onChange={setVendorId} style={{ maxWidth: 420 }} aria-label="Contractor company"
                      options={vendorGroups} />
                    <Select mode="tags" placeholder="Crew names: type a name and press Enter" value={crew} onChange={setCrew} style={{ maxWidth: 420 }} aria-label="Crew names" tokenSeparators={[',']} open={false} />
                    <Muted>The first name is the crew lead. The crew needs a site access request before it arrives.</Muted>
                  </>
                )}
                <div><Button type="primary" disabled={!valid || !dirty} onClick={save}>Save assignment</Button></div>
              </div>
            )}
        </div>
      </VwCard>

      <VwCard title="Site access" extra={v.accessState && wo.assigneeKind === 'contractor' ? <VwChip variant={v.accessState.tone}>{v.accessState.label}</VwChip> : undefined}>
        {wo.assigneeKind !== 'contractor'
          ? <div className="vw-card-description">Own technicians use their standing site access. Contractor crews need an access request (process P12): security approves the zones, the crew checks in and out.</div>
          : (
            <div className="vw-flex vw-flex-col vw-gap-sm">
              <div className="vw-card-description">{v.accessState?.detail}</div>
              {v.access && (
                <KvList items={[
                  { label: 'Request', value: <Link to={`/workorders/instances/${v.access.id}`}>{v.access.id}</Link> },
                  { label: 'Started', value: fmtDateTime(v.access.startedAt) },
                  { label: 'Visit', value: fmtWindow(row.start, row.end) },
                  { label: 'Crew', value: (wo.crew ?? []).join(', ') || '—' },
                ]} />
              )}
              {needsNewAccess && (
                <div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
                  <Button type="primary" loading={starting} disabled={!row.siteId || !wo.crew?.length} onClick={() => void requestAccess()}>Request site access</Button>
                  {!row.siteId && <Muted>The work order has no site.</Muted>}
                  {row.siteId && !wo.crew?.length && <Muted>Save the crew names first.</Muted>}
                </div>
              )}
            </div>
          )}
      </VwCard>
    </div>
  );
}
