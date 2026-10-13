/* Overview tab: what needs attention (failing checks), the plan in plain words, its phases and the inputs that
   differ from the template; on the right, how complete the inputs are, the approval path, conditions and deliverables. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from 'antd';
import type * as T from '../../../../mock/data/types';
import { VwCard, VwChip, fmtDate } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import * as G from '../../lib/governance';
import { fmtKw, ASPECT_LABEL, SOURCE_LABEL } from '../../lib/engine';
import { DECISION_TONE, KvList, Muted, fmtParam, monthYear, n0, paramDef, type PlanView } from './shared';

const PHASE_TONE = { Planned: 'neutral', Approved: 'info', 'In delivery': 'info', Live: 'success' } as const;
const STATUS_LABEL = { fail: 'Fails', warn: 'Warning', pass: 'Pass', 'n/a': 'Not applicable' } as const;

export function OverviewTab({ v }: { v: PlanView }) {
  const { plan, ev } = v;
  const departures = useMemo(() => Object.entries(ev.params).filter(([, s]) => s.source === 'user' || s.source === 'ai' || s.source === 'document'), [ev.params]);
  const template = ev.resolved?.template;
  const outputs = useMemo(() => [...new Set((ev.resolved?.chain ?? []).flatMap(t => t.outputs))], [ev.resolved]);
  const generated = !!plan.artefacts?.completedAt || plan.status === 'Executing' || plan.status === 'Completed';
  const previewEv = v.review?.ev ?? ev;
  const preview = useMemo(() => { const a = G.approvalAmount(previewEv); return G.buildApprovalPath(template, a.amountUsd, a.itUsd); }, [previewEv, template]);
  const approvals: T.PlannerApproval[] = plan.approvals.length ? plan.approvals : preview.approvals;
  const sortedPhases = useMemo(() => [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)), [plan.phases]);
  const attention = ev.findings.filter(f => f.status === 'fail' || f.status === 'warn').sort((a, b) => (a.status === b.status ? 0 : a.status === 'fail' ? -1 : 1));
  const applicable = ev.findings.filter(f => f.status !== 'n/a').length;
  const mix = [plan.demand.gpuPct && `${plan.demand.gpuPct}% GPU`, plan.demand.computePct && `${plan.demand.computePct}% compute`, plan.demand.storagePct && `${plan.demand.storagePct}% storage`].filter(Boolean).join(' · ');

  return (
    <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 380px)', alignItems: 'start' }}>
      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <VwCard title="Checks that need attention" extra={<Link to="?tab=rules">All {applicable} checks</Link>}>
          {attention.length === 0
            ? <div className="vw-card-description">All {applicable} checks that apply to this plan pass.</div>
            : (
              <div className="nst-table-wrap">
                <table className="nst-table" style={{ width: '100%' }}>
                  <thead><tr><th style={{ width: 110 }}>Result</th><th>Check</th><th>What was found</th></tr></thead>
                  <tbody>{attention.map(f => (
                    <tr key={f.rule.id}>
                      <td><VwChip variant={f.status === 'fail' ? 'error' : 'warning'}>{STATUS_LABEL[f.status]}</VwChip></td>
                      <td style={{ whiteSpace: 'normal', minWidth: 180 }}>{f.rule.title}</td>
                      <td style={{ whiteSpace: 'normal', color: 'var(--vw-color-slate-600)' }}>{f.detail}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
        </VwCard>

        <VwCard title="The plan">
          <div className="vw-card-description" style={{ color: 'var(--vw-color-slate-800)', marginBottom: 12 }}>{plan.intent || 'No description recorded.'}</div>
          <KvList columns={2} items={[
            { label: 'Requested by', value: plan.requestedBy || '—' },
            { label: 'Workload mix', value: mix || '—' },
            { label: 'Design density', value: `${plan.demand.densityKwPerRack} kW per rack` },
            { label: 'Rack classes', value: ev.sizing.rackClasses.map(c => `${c.racks} ${c.name.toLowerCase()} at ${c.kw} kW`).join(', ') || '—' },
            { label: 'Tenancy', value: plan.demand.tenancy === 'multi' ? 'Several tenants' : 'Single tenant' },
            { label: 'Growth', value: `${plan.demand.growthPctPerYear}% a year` },
            { label: 'Climate', value: plan.climate.replace('-', ' and ') },
            { label: 'Delivered as', value: template?.executesAs ? `${template.executesAs}${template.blueprintKey ? ` (${template.blueprintKey})` : ''}` : '—' },
          ]} />
        </VwCard>

        <VwCard title="Phases" extra={<Muted>{sortedPhases.length} phase{sortedPhases.length === 1 ? '' : 's'}</Muted>}>
          {sortedPhases.length === 0
            ? <div className="vw-card-description">No phases defined yet.</div>
            : (
              <div className="nst-table-wrap">
                <table className="nst-table" style={{ width: '100%' }}>
                  <thead><tr><th>Phase</th><th>Live</th><th style={{ textAlign: 'right' }}>IT load</th><th style={{ textAlign: 'right' }}>Racks</th><th style={{ textAlign: 'right' }}>Halls</th><th>Status</th></tr></thead>
                  <tbody>{sortedPhases.map(ph => (
                    <tr key={ph.id}>
                      <td>{ph.name}</td><td>{monthYear(ph.goLive)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtKw(ph.itKw)}</td><td style={{ textAlign: 'right' }}>{n0(ph.racks)}</td><td style={{ textAlign: 'right' }}>{ph.halls}</td>
                      <td><VwChip variant={PHASE_TONE[ph.status]}>{ph.status}</VwChip></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
        </VwCard>

        <VwCard title="Inputs changed from the template" extra={<Muted>{template ? `${template.name} v${template.version}` : 'No template'}</Muted>}>
          {departures.length === 0
            ? <div className="vw-card-description">Every input is at its template value.</div>
            : (
              <div className="nst-table-wrap">
                <table className="nst-table" style={{ width: '100%' }}>
                  <thead><tr><th>Input</th><th style={{ textAlign: 'right' }}>Value</th><th style={{ textAlign: 'right' }}>Template</th><th>Set by</th></tr></thead>
                  <tbody>{departures.map(([key, s]) => { const def = paramDef(ev, key); return (
                    <tr key={key}>
                      <td>{def?.label ?? key}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmtParam(s.value, def?.unit)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--vw-color-slate-500)' }}>{def?.default !== undefined ? fmtParam(def.default, def.unit) : '—'}</td>
                      <td style={{ color: 'var(--vw-color-slate-500)' }}>{SOURCE_LABEL[s.source]}{s.note ? ` · ${s.note}` : ''}</td>
                    </tr>
                  ); })}</tbody>
                </table>
              </div>
            )}
        </VwCard>
      </div>

      <div className="vw-flex vw-flex-col vw-gap-md" style={{ minWidth: 0 }}>
        <VwCard title="Inputs confirmed" extra={<Muted>{Math.round(ev.readinessPct)}% overall</Muted>}>
          <div className="vw-flex vw-flex-col vw-gap-sm">
            {ev.aspects.map(a => (
              <div key={a.aspect}>
                <div className="vw-flex vw-justify-between vw-gap-sm" style={{ fontSize: 'var(--vw-font-label-sm)' }}>
                  <span style={{ color: 'var(--vw-color-slate-800)' }}>{ASPECT_LABEL[a.aspect]}{a.findings.some(f => f.status === 'fail') && <span style={{ color: 'var(--vw-color-red-600)' }}> · check fails</span>}</span>
                  <span style={{ color: 'var(--vw-color-slate-500)', fontVariantNumeric: 'tabular-nums' }}>{a.answered} of {a.total}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'var(--vw-color-slate-100)', marginTop: 4 }}>
                  <div style={{ width: `${Math.min(100, a.pct)}%`, height: 4, borderRadius: 2, background: a.pct >= 100 ? 'var(--vw-color-green-500)' : 'var(--vw-color-slate-400)' }} />
                </div>
              </div>
            ))}
          </div>
        </VwCard>

        <VwCard title="Approval path" extra={<Muted>{plan.approvals.length ? `Round ${G.currentRound(plan)}` : 'Not submitted'}</Muted>}>
          {approvals.length === 0 && <div className="vw-card-description">No approval path on this template.</div>}
          <div className="vw-flex vw-flex-col">
            {G.orderedSteps(approvals).map((a, i, all) => (
              <div key={a.step} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
                <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
                  <span style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 500, color: 'var(--vw-color-slate-900)' }}>{i + 1}. {a.step}</span>
                  <VwChip variant={DECISION_TONE[a.decision]}>{a.decision}</VwChip>
                </div>
                <Muted size="xs">{G.roleOf(a.role)}{a.person ? ` · ${a.person}` : a.decision === 'Pending' ? ` · ${G.peopleWithRole(a.role).map(p => p.name).join(', ') || 'nobody holds this role'}` : ''}{a.onBehalfOf ? ` for ${a.onBehalfOf}` : ''}{a.at ? ` · ${fmtDate(a.at)}` : ''}</Muted>
                {a.reason && <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-700)', marginTop: 2 }}>Reason: {a.reason}</div>}
                {a.conditions && a.conditions !== a.reason && <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-700)', marginTop: 2 }}>Conditions: {a.conditions}</div>}
                {i === all.length - 1 && !plan.approvals.length && <div style={{ marginTop: 6 }}><Muted size="xs">{G.bandLabel(preview.band)}</Muted></div>}
              </div>
            ))}
          </div>
        </VwCard>

        <ConditionsCard v={v} />

        <VwCard title="Deliverables" extra={<Muted>{outputs.length}</Muted>}>
          {outputs.length === 0 && <div className="vw-card-description">The template declares no outputs.</div>}
          <div className="vw-flex vw-flex-col">
            {outputs.map((o, i) => (
              <div key={o} className="vw-flex vw-justify-between vw-items-center vw-gap-sm" style={{ padding: '6px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
                <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-800)' }}>{o}</span>
                <span style={{ fontSize: 'var(--vw-font-label-xs)', color: generated ? 'var(--vw-color-green-700)' : 'var(--vw-color-slate-500)' }}>{generated ? 'Created' : 'At build start'}</span>
              </div>
            ))}
          </div>
        </VwCard>
      </div>
    </div>
  );
}

/** Conditions attached to approvals: owner, due date, whether they block the build, and close-out with evidence. */
function ConditionsCard({ v }: { v: PlanView }) {
  const { plan, actions } = v;
  const conds = plan.conditions ?? [];
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [today] = useState(() => new Date().toISOString());
  if (!conds.length) return null;
  const open = conds.filter(c => c.status === 'Open');
  return (
    <VwCard title="Approval conditions" extra={<VwChip variant={open.length ? 'warning' : 'success'}>{open.length} open</VwChip>}>
      <div className="vw-flex vw-flex-col vw-gap-sm">
        {conds.map(c => (
          <div key={c.id} className="vw-card-child" style={{ padding: '8px 12px' }}>
            <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
              <span style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 500 }}>{c.text}</span>
              <span className="vw-inline-flex vw-gap-xs">{c.blocksExecution && c.status === 'Open' && <VwChip variant="error">Blocks build</VwChip>}{c.status === 'Open' && c.dueDate && c.dueDate < today && <VwChip variant="error">Overdue</VwChip>}<VwChip variant={c.status === 'Closed' ? 'success' : 'warning'}>{c.status}</VwChip></span>
            </div>
            <Muted size="xs">{c.id} · owner {c.owner}{c.dueDate ? ` · due ${c.dueDate.slice(0, 10)}` : ''} · raised by {c.raisedBy} {fmtDate(c.raisedAt)}</Muted>
            {c.status === 'Closed' && <div><Muted size="xs">Closed by {c.closedBy} {c.closedAt ? fmtDate(c.closedAt) : ''}: {c.evidence}</Muted></div>}
            {c.status === 'Open' && (
              <div className="vw-flex vw-gap-xs" style={{ marginTop: 6 }}>
                <Input size="small" value={evidence[c.id] ?? ''} onChange={e => setEvidence(x => ({ ...x, [c.id]: e.target.value }))} placeholder="Evidence: how it was met (document, record id…)" aria-label={`Evidence for ${c.id}`} />
                <Button size="small" disabled={(evidence[c.id] ?? '').trim().length < 5} onClick={() => { if (actions.closeCondition(plan, c.id, evidence[c.id] ?? '').ok) setEvidence(x => ({ ...x, [c.id]: '' })); }}>Close</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </VwCard>
  );
}
