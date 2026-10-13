/* Delivery tab: what execution created and how delivery is going — read live from the platform
   records tagged with the plan (projects, purchase orders, changes, windows, tests, permits,
   holds), the execution steps, and the completion checklist. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { VwCard, VwChip, fmtDate } from '../../../../shared/components/ux';
import { fmtKw, fmtUsd } from '../../lib/engine';
import { closeoutChecks, deliveryView } from '../../lib/closeout';
import { STEP_LABEL } from '../../lib/execute';
import type { PlannerData } from '../../lib/plannerData';
import { useInstances, STATE_LABEL, STATE_TONE, processName } from '../../../workorders/lib/useWorkflows';
import { Stat } from '../kit';
import { Muted, type PlanView } from './shared';

const RAG_TONE = { Red: 'error', Amber: 'warning', Green: 'success', Grey: 'neutral' } as const;
const PO_TONE: Record<string, 'neutral' | 'info' | 'cyan' | 'success'> = { Draft: 'neutral', Approved: 'info', Ordered: 'cyan', Received: 'success' };
const ok = (b: boolean) => <VwChip variant={b ? 'success' : 'error'}>{b ? 'Done' : 'Open'}</VwChip>;

export function DeliveryTab({ v, data }: { v: PlanView; data: PlannerData }) {
  const { plan } = v;
  const [nowMs] = useState(() => Date.now());
  const d = useMemo(() => deliveryView(plan, data, nowMs), [plan, data, nowMs]);
  const checks = useMemo(() => closeoutChecks(plan, data, v.ev.resolved?.template), [plan, data, v.ev.resolved]);
  const instances = useInstances();
  const procs = instances.filter(i => i.recordId === plan.id || i.id === plan.processInstanceId || (d.records.changeRequests.some(c => c.id === i.recordId)));
  const a = plan.artefacts;
  const r = d.records;
  const steps = Object.entries(a?.steps ?? {});

  if (!a?.executionId && plan.status !== 'Executing' && plan.status !== 'Completed') {
    return <VwCard><div className="vw-card-description">Nothing has been built yet. Delivery records appear here once the approved plan is executed{plan.status === 'Approved' ? ' (Start the build).' : '.'}</div></VwCard>;
  }
  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Stat label="Complete" value={d.pctComplete === undefined ? '—' : `${d.pctComplete}%`} sub={d.rag ? `RAG ${d.rag}` : `${r.projects.length} projects`} tone={d.rag === 'Red' ? 'bad' : d.rag === 'Amber' ? 'warn' : d.rag ? 'ok' : undefined} />
        <Stat label="Actual spend" value={fmtUsd(d.actualSpend)} sub={d.baselineCapex ? `of ${fmtUsd(d.baselineCapex)} baseline` : 'no baseline'} />
        <Stat label="Forecast variance" value={d.variancePct === undefined ? '—' : `${d.variancePct > 0 ? '+' : ''}${d.variancePct}%`} sub="spend plus open commitments vs baseline" tone={d.variancePct !== undefined && d.variancePct > 5 ? 'bad' : d.variancePct !== undefined && d.variancePct > 0 ? 'warn' : undefined} />
        <Stat label="POs overdue to order" value={d.overduePos.length} sub={`${r.purchaseOrders.length} purchase orders`} tone={d.overduePos.length ? 'bad' : 'ok'} />
        <Stat label="Changes" value={`${r.changeRequests.filter(c => c.status === 'Implemented' || c.status === 'Closed').length}/${r.changeRequests.length}`} sub="implemented" />
        <Stat label="Acceptance tests" value={`${d.atpByStatus.Accepted ?? 0}/${r.atps.length}`} sub="accepted" />
      </div>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <VwCard title="Execution" extra={<Muted>{a?.executionId ?? '—'}{a?.completedAt ? ` · finished ${fmtDate(a.completedAt)}` : ' · not finished'}</Muted>}>
          <div className="vw-flex vw-flex-col vw-gap-xs">
            {steps.map(([k, s]) => <div key={k} className="vw-flex vw-justify-between vw-items-center" style={{ fontSize: 'var(--vw-font-label-sm)' }}><span>{STEP_LABEL[k] ?? k}</span><VwChip variant={s === 'done' ? 'success' : s === 'failed' ? 'error' : 'neutral'}>{s}</VwChip></div>)}
            {(a?.errors ?? []).map((e, i) => <Muted key={i} size="xs">{STEP_LABEL[e.step] ?? e.step}: {e.message} ({fmtDate(e.at)})</Muted>)}
            <Muted size="xs">Delivery process: {a?.deliveryProcessKey === 'programme' ? 'the programme and its projects (budget already approved in the planner)' : a?.deliveryProcessKey ? processName(a.deliveryProcessKey) : '—'}</Muted>
            {procs.map(p => <div key={p.id} className="vw-flex vw-justify-between vw-items-center" style={{ fontSize: 'var(--vw-font-label-sm)' }}><Link to={`/workorders/instances/${p.id}`}>{processName(p.definitionKey)} · {p.businessKey}</Link><VwChip variant={STATE_TONE[p.state]}>{STATE_LABEL[p.state]}</VwChip></div>)}
          </div>
        </VwCard>
        <VwCard title="Completion checklist" extra={<VwChip variant={checks.every(c => c.ok) ? 'success' : 'warning'}>{checks.filter(c => c.ok).length}/{checks.length}</VwChip>}>
          <div className="vw-flex vw-flex-col vw-gap-xs">
            {checks.map(c => <div key={c.key} className="vw-flex vw-justify-between vw-items-start vw-gap-sm" style={{ fontSize: 'var(--vw-font-label-sm)' }}><span style={{ minWidth: 0 }}>{c.label}<br /><Muted size="xs">{c.detail}</Muted></span>{ok(c.ok)}</div>)}
          </div>
          {plan.closeout && <div style={{ marginTop: 8 }}><Muted>Completed {fmtDate(plan.closeout.completedAt)} by {plan.closeout.completedBy}: {fmtKw(plan.closeout.deliveredKw)} delivered, {fmtUsd(plan.closeout.actualCapex)} spent{plan.closeout.measuredKw !== undefined ? `, ${fmtKw(plan.closeout.measuredKw)} measured` : ''}.</Muted></div>}
        </VwCard>
      </div>

      <VwCard title="Programme and projects" extra={r.program ? <Link to={`/delivery/programs/${r.program.id}`}>{r.program.id} · budget {fmtUsd(r.program.budget)}</Link> : <Muted>No programme</Muted>}>
        {!r.projects.length ? <div className="vw-card-description">No project is linked to this plan.</div> : (
          <div className="nst-table-wrap"><table className="nst-table">
            <thead><tr><th>Project</th><th>Status</th><th>RAG</th><th style={{ textAlign: 'right' }}>Complete</th><th style={{ textAlign: 'right' }}>Budget</th><th style={{ textAlign: 'right' }}>Actual</th><th>Planned end</th><th>Handover</th></tr></thead>
            <tbody>{r.projects.map(p => { const h = r.hotos.find(x => x.projectId === p.id); return (
              <tr key={p.id}><td><Link to={`/delivery/projects/${p.id}`}>{p.id}</Link> {p.name}</td><td>{p.status}</td><td><VwChip variant={RAG_TONE[p.rag]}>{p.rag}</VwChip></td><td style={{ textAlign: 'right' }}>{p.percentComplete}%</td><td style={{ textAlign: 'right' }}>{fmtUsd(p.budget)}</td><td style={{ textAlign: 'right' }}>{fmtUsd(p.actualSpend)}</td><td>{fmtDate(p.plannedEnd)}</td><td>{h ? h.status : 'Not started'}</td></tr>
            ); })}</tbody>
          </table></div>
        )}
        {d.lateMilestones.length > 0 && <div style={{ marginTop: 6 }}><Muted size="xs">Late milestones: {d.lateMilestones.slice(0, 5).map(m => `${m.name} (due ${m.dueDate.slice(0, 10)})`).join('; ')}</Muted></div>}
      </VwCard>

      <VwCard title="Purchase orders" extra={<Muted>{Object.entries(d.poByStatus).map(([s, n]) => `${n} ${s}`).join(' · ') || 'none'}</Muted>}>
        {!r.purchaseOrders.length ? <div className="vw-card-description">No purchase order is linked to this plan.</div> : (
          <div className="nst-table-wrap"><table className="nst-table">
            <thead><tr><th>PO</th><th>Status</th><th style={{ textAlign: 'right' }}>Planned</th><th style={{ textAlign: 'right' }}>Actual</th><th>Order by</th><th>Need by</th></tr></thead>
            <tbody>{r.purchaseOrders.map(p => { const late = d.overduePos.includes(p); return (
              <tr key={p.id}><td>{p.id}</td><td><VwChip variant={PO_TONE[p.status] ?? 'neutral'}>{p.status}</VwChip></td><td style={{ textAlign: 'right' }}>{fmtUsd(p.plannedCost)}</td><td style={{ textAlign: 'right' }}>{fmtUsd(p.actualSpend)}</td><td>{p.orderBy?.slice(0, 10) ?? '—'} {late && <VwChip variant="error">Overdue</VwChip>}</td><td>{p.needBy?.slice(0, 10) ?? '—'}</td></tr>
            ); })}</tbody>
          </table></div>
        )}
      </VwCard>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <VwCard title={d.waves.length ? 'Waves, changes and windows' : 'Changes and windows'}>
          {d.waves.length > 0 ? d.waves.map(w => (
            <div key={w.wave.id} className="vw-flex vw-justify-between vw-items-center vw-gap-sm" style={{ borderBottom: '1px solid var(--vw-color-slate-100)', padding: '4px 0', fontSize: 'var(--vw-font-label-sm)' }}>
              <span>{w.wave.name} <Muted size="xs">{w.wave.windowStart.slice(0, 10)}</Muted></span>
              <span className="vw-inline-flex vw-gap-xs">{w.change ? <VwChip variant="neutral">{w.change.id} {w.change.status}</VwChip> : <VwChip variant="warning">No change</VwChip>}{w.window ? <VwChip variant="neutral">{w.window.id} {w.window.status}</VwChip> : null}<VwChip variant={w.wave.status === 'Closed' ? 'success' : 'info'}>{w.wave.status}</VwChip></span>
            </div>
          )) : (
            <div className="vw-flex vw-flex-col vw-gap-xs">
              {r.changeRequests.map(c => <div key={c.id} className="vw-flex vw-justify-between" style={{ fontSize: 'var(--vw-font-label-sm)' }}><Link to={`/change/${c.id}`}>{c.id} {c.title}</Link><VwChip variant={c.status === 'Implemented' || c.status === 'Closed' ? 'success' : 'info'}>{c.status}</VwChip></div>)}
              {r.windows.map(m => <div key={m.id} className="vw-flex vw-justify-between" style={{ fontSize: 'var(--vw-font-label-sm)' }}><span>{m.id} {m.title} <Muted size="xs">{m.scheduledStart.slice(0, 10)}</Muted></span><VwChip variant="neutral">{m.status}</VwChip></div>)}
              {!r.changeRequests.length && !r.windows.length && <Muted>No change request or window is linked.</Muted>}
            </div>
          )}
        </VwCard>
        <VwCard title="Tests, permits and holds">
          <div className="vw-flex vw-flex-col vw-gap-xs" style={{ fontSize: 'var(--vw-font-label-sm)' }}>
            <span>Acceptance tests: {Object.entries(d.atpByStatus).map(([s, n]) => `${n} ${s}`).join(', ') || 'none linked'}</span>
            <span>Permits: {r.permits.length ? `${r.permits.length - d.permitsOpen.length} of ${r.permits.length} approved` : 'none'}{d.permitsOpen.length ? ` · open: ${d.permitsOpen.slice(0, 3).map(p => `${p.name} (${p.status})`).join(', ')}` : ''}</span>
            <span>Capacity holds: {r.reservations.length ? r.reservations.map(x => `${x.id} ${x.resourceType} ${x.quantity} ${x.unit} ${x.status === 'Released' ? 'Released' : x.state}`).join('; ') : 'none'}</span>
            <span>Rack units held: {r.rackReservations.length ? r.rackReservations.map(x => `${x.rackId} U${x.units[0]}–${x.units[x.units.length - 1]} ${x.status}`).join('; ') : 'none'}</span>
          </div>
        </VwCard>
      </div>
    </div>
  );
}
