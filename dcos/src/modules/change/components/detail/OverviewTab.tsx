/* Overview: what and why, the implementation / test / backout plans, the affected equipment and the
   materials summary (required items and their availability, retired units, kit readiness; advisory; the
   Materials tab has the detail) on the left; on the right who is affected (services and customers), the freeze status and the clash check. */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarSearch, FileText, ListChecks, Server, Snowflake, Users } from 'lucide-react';
import { Chip, Empty, Panel } from '../../../../ops/ui/kit';
import { DataTable } from '../../../../ops/ui/DataTable';
import { useEntityList } from '../../../../shared/hooks/useEntityCRUD';
import type * as T from '../../../../mock/data/types';
import { impactOf, clashes } from '../../../planner/lib/impact';
import { CHANGE_TYPE_LABEL, fmtDay, fmtWhen, plural, siteLabel } from '../../lib/model';
import { KvList, Muted, Note } from '../kit';
import { MaterialsCard } from '../ChangeMaterials';
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
    <div className="grid g-2-1" style={{ alignItems: 'start' }}>
      <div className="col" style={{ gap: 18 }}>
        <Panel title="What and why" icon={FileText}>
          <p style={{ margin: '0 0 14px', whiteSpace: 'pre-line' }}>{c.description || 'No description recorded.'}</p>
          <KvList columns={2} items={[
            { label: 'Type', value: CHANGE_TYPE_LABEL[c.type] ?? c.type },
            { label: 'Class', value: `${row.cls}: ${classWhy}` },
            { label: 'Priority', value: c.priority },
            { label: 'Requested by', value: c.requestedBy },
            { label: 'Raised', value: fmtDay(c.createdAt) },
            { label: 'Source', value: c.source ? `${c.source}${c.externalRef ? ` ${c.externalRef}` : ''}` : 'Raised in DCOS' },
          ]} />
          {violations.length > 0 && <Note tone="warn" style={{ marginTop: 12 }}>Policy findings: {violations.join('; ')}. Approvers see these before they decide.</Note>}
        </Panel>

        <Panel title="Plans" icon={ListChecks}>
          <KvList items={[
            { label: 'Implementation', value: c.implementationPlan || <Muted>Not written yet. Add it before the change is decided.</Muted> },
            { label: 'Test', value: c.testPlan || <Muted>Not written yet. Say how the work is proven to be right.</Muted> },
            { label: 'Backout', value: c.backoutPlan || c.rollbackPlan || <Muted>Not written yet. Say how the work is reversed if a test fails.</Muted> },
          ]} />
        </Panel>

        <Panel title="Affected equipment" icon={Server} count={equipment.length} sub={`${plural(equipment.length, 'item')}${downstream ? ` · ${downstream} more behind them` : ''}`} flush>
          <DataTable compact rows={equipment} pageSize={25}
            empty={<Empty icon={Server} title="No rack or device is recorded on this change">Facility work with no IT equipment in scope can leave this empty.</Empty>}
            cols={[
              { key: 'id', header: 'ID', render: e => (e.to ? <Link className="ent-link mono" to={e.to}>{e.id}</Link> : <span className="mono">{e.id}</span>) },
              { key: 'kind', header: 'Kind', render: e => e.kind },
              { key: 'name', header: 'Name', render: e => e.name ?? <Muted>{e.kind === 'Device' || e.kind === 'Rack' ? 'not in the inventory' : '—'}</Muted> },
              { key: 'where', header: 'Where', render: e => e.where ?? '—' },
            ]} />
        </Panel>

        <MaterialsCard m={v.materials} onOpen={() => v.goTab('materials')} />
      </div>

      <div className="col" style={{ gap: 18 }}>
        <Panel title="Who is affected" icon={Users}>
          {c.impactSummary && <p style={{ margin: '0 0 12px' }}>{c.impactSummary}</p>}
          <KvList columns={2} items={[
            { label: 'Services', value: `${impact.services.length}${impact.critical ? ` (${impact.critical} critical)` : ''}` },
            { label: 'Customers', value: impact.customers.length },
            { label: 'Revenue on scope', value: impact.revenueMonthly ? `${usd(impact.revenueMonthly)} a month` : '—' },
            { label: 'Tightest SLA', value: impact.minSla ? `${impact.minSla}%` : '—' },
            { label: 'Circuits ending here', value: impact.terminations.length },
          ]} />
          {impact.customers.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <DataTable compact rows={impact.customers.slice(0, 8).map(x => ({ ...x, id: x.customer.id }))} pageSize={8} cols={[
                { key: 'cust', header: 'Customer', render: x => <span className="cell-2"><Link className="ent-link" to={`/customers/${x.customer.id}`}>{x.customer.name}</Link>{x.customer.premium && <small>premium</small>}</span> },
                { key: 'svc', header: 'Services', align: 'right', render: x => <span className="num">{x.services.length}</span> },
                { key: 'crit', header: 'Critical', align: 'right', render: x => <span className="num" style={{ color: x.critical ? 'var(--vw-color-red-600)' : undefined }}>{x.critical}</span> },
              ]} />
              {impact.customers.length > 8 && <Muted size="xs">and {impact.customers.length - 8} more customers</Muted>}
            </div>
          ) : <p className="vw-label" style={{ margin: '10px 0 0' }}>{equipment.length ? 'No customer service runs on or through the affected equipment.' : 'Add the affected equipment to see who is affected.'}</p>}
        </Panel>

        <Panel title="Freeze" icon={Snowflake}>
          {row.freeze ? (
            <div className="col" style={{ gap: 6 }}>
              <span><Chip tone={row.cls === 'Emergency' ? 'warning' : 'error'} dot>{row.cls === 'Emergency' ? 'In a freeze, allowed as an emergency' : 'In a freeze'}</Chip></span>
              <p style={{ margin: 0 }}>The window falls in "{row.freeze.name}" ({fmtDay(row.freeze.start)} to {fmtDay(row.freeze.end)}, {row.freeze.dataCenterId ? siteLabel(v.d.dataCenters.find(s => s.id === row.freeze!.dataCenterId)) : 'all sites'}). {row.freeze.allows === 'None' ? 'No change may be implemented.' : 'Only emergency changes may be implemented.'} {row.cls !== 'Emergency' ? 'Move the window on the Window tab, or raise the work as an emergency.' : ''}</p>
            </div>
          ) : <p className="vw-label" style={{ margin: 0 }}>{row.start ? 'No freeze covers the window.' : 'No window booked yet; the freeze check runs when one is booked.'}</p>}
        </Panel>

        <Panel title="Clash check" icon={CalendarSearch} sub={row.start ? fmtWhen(row.start) : undefined} count={row.start ? clash.length : undefined}>
          {!row.start ? <p className="vw-label" style={{ margin: 0 }}>Book a window to check it against other work at the site.</p>
            : clash.length === 0 ? <p className="vw-label" style={{ margin: 0 }}>No other window or open change at {siteLabel(row.site)} touches the same equipment at this time.</p> : (
              <div className="col" style={{ gap: 0 }}>
                {clash.map((x, i) => (
                  <div key={`${x.kind}-${x.id}`} style={{ padding: '6px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
                    <div className="row between" style={{ gap: 8 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {x.kind === 'change' ? <Link className="ent-link mono" to={`/changes/${x.id}`}>{x.id}</Link> : <span className="mono">{x.id}</span>} {x.title}
                      </span>
                      <Chip tone={x.severity === 'block' ? 'error' : 'warning'}>{x.severity === 'block' ? 'Clash' : 'Check'}</Chip>
                    </div>
                    <Muted size="xs">{x.start ? `${fmtWhen(x.start)}` : 'no window'}{x.overlapTime ? ' · same time' : ''}{x.sharedResources.length ? ` · shares ${x.sharedResources.slice(0, 3).join(', ')}${x.sharedResources.length > 3 ? '…' : ''}` : ' · same site, different equipment'}</Muted>
                  </div>
                ))}
              </div>
            )}
        </Panel>
      </div>
    </div>
  );
}
