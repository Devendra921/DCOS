/* Overview tab: what needs attention (failing checks), the plan in plain words, its phases and the inputs that
   differ from the template; on the right, how complete the inputs are, the approval path, conditions and deliverables. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from 'antd';
import type * as T from '../../../../mock/data/types';
import { CalendarRange, ClipboardCheck, FileText, ListChecks, Package, ShieldAlert, SlidersHorizontal, Stamp } from 'lucide-react';
import { fmtDate } from '../../../../shared/components/ux';
import { Btn, Chip, Panel, PanelLink } from '../../../../ops/ui/kit';
import { SoftMeter } from '../../../../ops/ui/Analytics';
import * as G from '../../lib/governance';
import { fmtKw, ASPECT_LABEL, SOURCE_LABEL } from '../../lib/engine';
import { DECISION_TONE, KvList, Muted, fmtParam, monthYear, n0, paramDef, type PlanView } from './shared';

const PHASE_TONE = { Planned: 'neutral', Approved: 'info', 'In delivery': 'info', Live: 'success' } as const;
const STATUS_LABEL = { fail: 'Fails', warn: 'Warning', pass: 'Pass', 'n/a': 'Not applicable' } as const;

export function OverviewTab({ v }: { v: PlanView }) {
  const { plan, ev } = v;
  const navigate = useNavigate();
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
    <div className="grid g-main-side" style={{ alignItems: 'start' }}>
      <div className="col" style={{ gap: 16, minWidth: 0 }}>
        <Panel flush={attention.length > 0} icon={ShieldAlert} title="Checks that need attention" count={attention.length} actions={<PanelLink onClick={() => navigate('?tab=rules')}>All {applicable} checks</PanelLink>}>
          {attention.length === 0
            ? <div className="muted">All {applicable} checks that apply to this plan pass.</div>
            : (
              <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
                  <thead><tr><th>Result</th><th>Check</th><th>What was found</th></tr></thead>
                  <tbody>{attention.map(f => (
                    <tr key={f.rule.id}>
                      <td><Chip tone={f.status === 'fail' ? 'error' : 'warning'}>{STATUS_LABEL[f.status]}</Chip></td>
                      <td className="is-wrap" style={{ minWidth: 180 }}><span className="vw-card-activity-label">{f.rule.title}</span></td>
                      <td className="is-wrap"><Muted>{f.detail}</Muted></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div></div>
            )}
        </Panel>

        <Panel icon={FileText} title="The plan">
          <div style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 16 }}>{plan.intent || 'No description recorded.'}</div>
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
        </Panel>

        <Panel flush={sortedPhases.length > 0} icon={CalendarRange} title="Phases" count={sortedPhases.length}>
          {sortedPhases.length === 0
            ? <div className="muted">No phases defined yet.</div>
            : (
              <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
                  <thead><tr><th>Phase</th><th>Live</th><th className="is-right num">IT load</th><th className="is-right num">Racks</th><th className="is-right num">Halls</th><th>Status</th></tr></thead>
                  <tbody>{sortedPhases.map(ph => (
                    <tr key={ph.id}>
                      <td>{ph.name}</td><td>{monthYear(ph.goLive)}</td>
                      <td className="is-right num">{fmtKw(ph.itKw)}</td><td className="is-right num">{n0(ph.racks)}</td><td className="is-right num">{ph.halls}</td>
                      <td><Chip tone={PHASE_TONE[ph.status]}>{ph.status}</Chip></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div></div>
            )}
        </Panel>

        <Panel flush={departures.length > 0} icon={SlidersHorizontal} title="Inputs changed from the template" count={departures.length} sub={template ? `${template.name} v${template.version}` : 'No template'}>
          {departures.length === 0
            ? <div className="muted">Every input is at its template value.</div>
            : (
              <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
                  <thead><tr><th>Input</th><th className="is-right num">Value</th><th className="is-right num">Template</th><th>Set by</th></tr></thead>
                  <tbody>{departures.map(([key, s]) => { const def = paramDef(ev, key); return (
                    <tr key={key}>
                      <td>{def?.label ?? key}</td>
                      <td className="is-right num" style={{ fontWeight: 500 }}>{fmtParam(s.value, def?.unit)}</td>
                      <td className="is-right num muted">{def?.default !== undefined ? fmtParam(def.default, def.unit) : '—'}</td>
                      <td className="muted">{SOURCE_LABEL[s.source]}{s.note ? ` · ${s.note}` : ''}</td>
                    </tr>
                  ); })}</tbody>
                </table>
              </div></div>
            )}
        </Panel>
      </div>

      <div className="col" style={{ gap: 16, minWidth: 0 }}>
        <Panel icon={ListChecks} title="Inputs confirmed" actions={<Muted>{Math.round(ev.readinessPct)}% overall</Muted>}>
          <div className="col" style={{ gap: 10 }}>
            {ev.aspects.map(a => (
              <div key={a.aspect}>
                <div className="vw-flex vw-justify-between vw-gap-sm" style={{ fontSize: 'var(--vw-font-label-sm)' }}>
                  <span style={{ color: 'var(--vw-color-slate-800)' }}>{ASPECT_LABEL[a.aspect]}{a.findings.some(f => f.status === 'fail') && <span style={{ color: 'var(--vw-color-red-600)' }}> · check fails</span>}</span>
                  <span style={{ color: 'var(--vw-color-slate-500)', fontVariantNumeric: 'tabular-nums' }}>{a.answered} of {a.total}</span>
                </div>
                <div style={{ marginTop: 4 }}><SoftMeter pct={Math.min(100, a.pct)} tone={a.pct >= 100 ? 'success' : 'neutral'} /></div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel icon={Stamp} title="Approval path" actions={<Muted>{plan.approvals.length ? `Round ${G.currentRound(plan)}` : 'Not submitted'}</Muted>}>
          {approvals.length === 0 && <div className="muted">No approval path on this template.</div>}
          <div className="col" style={{ gap: 0 }}>
            {G.orderedSteps(approvals).map((a, i, all) => (
              <div key={a.step} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
                <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
                  <span style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 500, color: 'var(--vw-color-slate-900)' }}>{i + 1}. {a.step}</span>
                  <Chip tone={DECISION_TONE[a.decision]}>{a.decision}</Chip>
                </div>
                <Muted size="xs">{G.roleOf(a.role)}{a.person ? ` · ${a.person}` : a.decision === 'Pending' ? ` · ${G.peopleWithRole(a.role).map(p => p.name).join(', ') || 'nobody holds this role'}` : ''}{a.onBehalfOf ? ` for ${a.onBehalfOf}` : ''}{a.at ? ` · ${fmtDate(a.at)}` : ''}</Muted>
                {a.reason && <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-700)', marginTop: 2 }}>Reason: {a.reason}</div>}
                {a.conditions && a.conditions !== a.reason && <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-700)', marginTop: 2 }}>Conditions: {a.conditions}</div>}
                {i === all.length - 1 && !plan.approvals.length && <div style={{ marginTop: 6 }}><Muted size="xs">{G.bandLabel(preview.band)}</Muted></div>}
              </div>
            ))}
          </div>
        </Panel>

        <ConditionsCard v={v} />

        <Panel icon={Package} title="Deliverables" count={outputs.length}>
          {outputs.length === 0 && <div className="muted">The template declares no outputs.</div>}
          <div className="col" style={{ gap: 0 }}>
            {outputs.map((o, i) => (
              <div key={o} className="vw-flex vw-justify-between vw-items-center vw-gap-sm" style={{ padding: '6px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
                <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-800)' }}>{o}</span>
                <span style={{ fontSize: 'var(--vw-font-label-xs)', color: generated ? 'var(--vw-color-green-700)' : 'var(--vw-color-slate-500)' }}>{generated ? 'Created' : 'At build start'}</span>
              </div>
            ))}
          </div>
        </Panel>
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
    <Panel icon={ClipboardCheck} title="Approval conditions" actions={<Chip tone={open.length ? 'warning' : 'success'} dot>{open.length} open</Chip>}>
      <div className="col" style={{ gap: 8 }}>
        {conds.map(c => (
          <div key={c.id} style={{ padding: '10px 12px', border: '1px solid var(--vw-color-slate-200)', borderRadius: 10 }}>
            <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm">
              <span style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 500 }}>{c.text}</span>
              <span className="vw-inline-flex vw-gap-xs">{c.blocksExecution && c.status === 'Open' && <Chip tone="error">Blocks build</Chip>}{c.status === 'Open' && c.dueDate && c.dueDate < today && <Chip tone="error">Overdue</Chip>}<Chip tone={c.status === 'Closed' ? 'success' : 'warning'}>{c.status}</Chip></span>
            </div>
            <Muted size="xs">{c.id} · owner {c.owner}{c.dueDate ? ` · due ${c.dueDate.slice(0, 10)}` : ''} · raised by {c.raisedBy} {fmtDate(c.raisedAt)}</Muted>
            {c.status === 'Closed' && <div><Muted size="xs">Closed by {c.closedBy} {c.closedAt ? fmtDate(c.closedAt) : ''}: {c.evidence}</Muted></div>}
            {c.status === 'Open' && (
              <div className="vw-flex vw-gap-xs" style={{ marginTop: 6 }}>
                <Input size="small" value={evidence[c.id] ?? ''} onChange={e => setEvidence(x => ({ ...x, [c.id]: e.target.value }))} placeholder="Evidence: how it was met (document, record id…)" aria-label={`Evidence for ${c.id}`} />
                <Btn size="xs" disabled={(evidence[c.id] ?? '').trim().length < 5} onClick={() => { if (actions.closeCondition(plan, c.id, evidence[c.id] ?? '').ok) setEvidence(x => ({ ...x, [c.id]: '' })); }}>Close</Btn>
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
