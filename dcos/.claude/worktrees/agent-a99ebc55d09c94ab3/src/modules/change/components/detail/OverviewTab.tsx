/* Overview: what and why, the implementation / test / backout plans and the affected equipment on the
   left; on the right who is affected (services and customers), the freeze status and the clash check. */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { useEntityList } from '../../../../shared/hooks/useEntityCRUD';
import type * as T from '../../../../mock/data/types';
import { impactOf, clashes } from '../../../planner/lib/impact';
import { CHANGE_TYPE_LABEL, fmtDay, fmtWhen, plural, siteLabel } from '../../lib/model';
import { KvList, Muted } from '../kit';
import type { ChangeView } from './shared';

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function OverviewTab({ v }: { v: ChangeView }) {
  const { c, ch, row, pd, rackIds, deviceIds } = v;
  const policies = (useEntityList('policies', { pageSize: 500 }).data?.data ?? []) as unknown as T.Policy[];
  const impact = useMemo(() => impactOf(pd, { deviceIds, rackIds }), [pd, deviceIds, rackIds]);
  const clash = useMemo(() => row.start ? clashes(pd, { dataCenterId: row.site?.id, deviceIds, rackIds, start: row.start, end: row.end ?? row.start, excludeChangeIds: [c.id] }) : [], [pd, row.site?.id, row.start, row.end, deviceIds, rackIds, c.id]);
  const rule = ch.change.approvalRuleId ? v.d.approvalMatrixRules.find(r => r.id === ch.change.approvalRuleId) : undefined;
  const classWhy = row.cls === 'Standard' ? (ch.template ? `Pre-approved by the template "${ch.template.name}"` : 'Pre-approved standard change')
    : row.cls === 'Emergency' ? 'Raised as an emergency: decided by the emergency board, reviewed afterwards'
    : rule ? `Approval matrix rule "${rule.name}" and the weekly change board` : 'Approval matrix and the weekly change board';
  const racks = new Map(pd.racks.map(r => [r.id, r])), devices = new Map(pd.devices.map(x => [x.id, x]));
  const equipment = [...rackIds.map(id => ({ id, kind: 'Rack', name: racks.get(id)?.name, where: racks.get(id) ? siteLabel(pd.dataCenters.find(s => s.id === racks.get(id)!.dataCenterId)) : undefined, to: racks.get(id) ? `/facility/racks/${id}` : undefined })),
    ...deviceIds.map(id => { const dv = devices.get(id); const rk = dv?.rackId ? racks.get(dv.rackId) : undefined; return { id, kind: dv ? 'Device' : c.affectedResourceType === 'Asset' ? 'Device' : c.affectedResourceType || 'Item', name: dv?.name, where: rk ? `rack ${rk.name}` : dv ? siteLabel(pd.dataCenters.find(s => s.id === dv.dataCenterId)) : undefined, to: dv ? `/facility/devices/${id}` : undefined }; })];
  const downstream = impact.downstreamDeviceIds.length;
  const violations = (c.policyViolations ?? []).map(pv => policies.find(p => p.id === pv)?.name ?? pv);

  return (
    <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 420px)', alignItems: 'start' }}>
      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <VwCard title="What and why">
          <div className="vw-card-description" style={{ color: 'var(--vw-color-slate-800)', marginBottom: 12, whiteSpace: 'pre-line' }}>{c.description || 'No description recorded.'}</div>
          <KvList columns={2} items={[
            { label: 'Type', value: CHANGE_TYPE_LABEL[c.type] ?? c.type },
            { label: 'Class', value: `${row.cls}: ${classWhy}` },
            { label: 'Priority', value: c.priority },
            { label: 'Requested by', value: c.requestedBy },
            { label: 'Raised', value: fmtDay(c.createdAt) },
            { label: 'Source', value: c.source ? `${c.source}${c.externalRef ? ` ${c.externalRef}` : ''}` : 'Raised in DCOS' },
          ]} />
          {violations.length > 0 && (
            <VwCard variant="child" tone="warning" style={{ marginTop: 12 }}>
              <div className="vw-card-description">Policy findings: {violations.join('; ')}. Approvers see these before they decide.</div>
            </VwCard>
          )}
        </VwCard>

        <VwCard title="Plans">
          <KvList items={[
            { label: 'Implementation', value: c.implementationPlan || <Muted>Not written yet. Add it before the change is decided.</Muted> },
            { label: 'Test', value: c.testPlan || <Muted>Not written yet. Say how the work is proven to be right.</Muted> },
            { label: 'Backout', value: c.backoutPlan || c.rollbackPlan || <Muted>Not written yet. Say how the work is reversed if a test fails.</Muted> },
          ]} />
        </VwCard>

        <VwCard title="Affected equipment" extra={<Muted>{plural(equipment.length, 'item')}{downstream ? ` · ${downstream} more behind them` : ''}</Muted>}>
          {equipment.length === 0 ? <div className="vw-card-description">No rack or device is recorded on this change. Facility work with no IT equipment in scope can leave this empty.</div> : (
            <div className="nst-table-wrap">
              <table className="nst-table" style={{ width: '100%' }}>
                <thead><tr><th>ID</th><th>Kind</th><th>Name</th><th>Where</th></tr></thead>
                <tbody>{equipment.map(e => (
                  <tr key={e.id}>
                    <td>{e.to ? <Link to={e.to}>{e.id}</Link> : e.id}</td><td>{e.kind}</td>
                    <td>{e.name ?? <Muted>{e.kind === 'Device' || e.kind === 'Rack' ? 'not in the inventory' : '—'}</Muted>}</td><td>{e.where ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </VwCard>
      </div>

      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <VwCard title="Who is affected">
          {c.impactSummary && <div className="vw-card-description" style={{ marginBottom: 8, color: 'var(--vw-color-slate-800)' }}>{c.impactSummary}</div>}
          <KvList items={[
            { label: 'Services', value: `${impact.services.length}${impact.critical ? ` (${impact.critical} critical)` : ''}` },
            { label: 'Customers', value: impact.customers.length },
            { label: 'Revenue on scope', value: impact.revenueMonthly ? `${usd(impact.revenueMonthly)} a month` : '—' },
            { label: 'Tightest SLA', value: impact.minSla ? `${impact.minSla}%` : '—' },
            { label: 'Circuits ending here', value: impact.terminations.length },
          ]} />
          {impact.customers.length > 0 ? (
            <div className="nst-table-wrap" style={{ marginTop: 10 }}>
              <table className="nst-table" style={{ width: '100%' }}>
                <thead><tr><th>Customer</th><th style={{ textAlign: 'right' }}>Services</th><th style={{ textAlign: 'right' }}>Critical</th></tr></thead>
                <tbody>{impact.customers.slice(0, 8).map(x => (
                  <tr key={x.customer.id}><td><Link to={`/customers/${x.customer.id}`}>{x.customer.name}</Link>{x.customer.premium && <Muted size="xs"> · premium</Muted>}</td><td style={{ textAlign: 'right' }}>{x.services.length}</td><td style={{ textAlign: 'right', color: x.critical ? 'var(--vw-color-red-600)' : undefined }}>{x.critical}</td></tr>
                ))}</tbody>
              </table>
              {impact.customers.length > 8 && <Muted size="xs">and {impact.customers.length - 8} more customers</Muted>}
            </div>
          ) : <div className="vw-card-description" style={{ marginTop: 8 }}>{equipment.length ? 'No customer service runs on or through the affected equipment.' : 'Add the affected equipment to see who is affected.'}</div>}
        </VwCard>

        <VwCard title="Freeze">
          {row.freeze ? (
            <div className="vw-flex vw-flex-col vw-gap-xs">
              <VwChip variant={row.cls === 'Emergency' ? 'warning' : 'error'}>{row.cls === 'Emergency' ? 'In a freeze, allowed as an emergency' : 'In a freeze'}</VwChip>
              <div className="vw-card-description">The window falls in "{row.freeze.name}" ({fmtDay(row.freeze.start)} to {fmtDay(row.freeze.end)}, {row.freeze.dataCenterId ? siteLabel(v.d.dataCenters.find(s => s.id === row.freeze!.dataCenterId)) : 'all sites'}). {row.freeze.allows === 'None' ? 'No change may be implemented.' : 'Only emergency changes may be implemented.'} {row.cls !== 'Emergency' ? 'Move the window on the Window tab, or raise the work as an emergency.' : ''}</div>
            </div>
          ) : <div className="vw-card-description">{row.start ? 'No freeze covers the window.' : 'No window booked yet; the freeze check runs when one is booked.'}</div>}
        </VwCard>

        <VwCard title="Clash check" extra={row.start ? <Muted>{fmtWhen(row.start)}</Muted> : undefined}>
          {!row.start ? <div className="vw-card-description">Book a window to check it against other work at the site.</div>
            : clash.length === 0 ? <div className="vw-card-description">No other window or open change at {siteLabel(row.site)} touches the same equipment at this time.</div> : (
              <div className="vw-flex vw-flex-col">
                {clash.map((x, i) => (
                  <div key={`${x.kind}-${x.id}`} style={{ padding: '6px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
                    <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
                      <span style={{ fontSize: 'var(--vw-font-label-sm)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {x.kind === 'change' ? <Link to={`/changes/${x.id}`}>{x.id}</Link> : x.id} {x.title}
                      </span>
                      <VwChip variant={x.severity === 'block' ? 'error' : 'warning'}>{x.severity === 'block' ? 'Clash' : 'Check'}</VwChip>
                    </div>
                    <Muted size="xs">{x.start ? `${fmtWhen(x.start)}` : 'no window'}{x.overlapTime ? ' · same time' : ''}{x.sharedResources.length ? ` · shares ${x.sharedResources.slice(0, 3).join(', ')}${x.sharedResources.length > 3 ? '…' : ''}` : ' · same site, different equipment'}</Muted>
                  </div>
                ))}
              </div>
            )}
        </VwCard>
      </div>
    </div>
  );
}
