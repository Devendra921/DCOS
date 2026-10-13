/* Overview tab: readiness and rules at a glance, departures from the template, demand, phases, approvals, deliverables, AI feedback. */
import { useMemo } from 'react';
import type * as T from '../../../../mock/data/types';
import { VwCard, VwChip, fmtDate } from '../../../../shared/components/ux';
import { AspectRadar, RuleGauge } from '../charts';
import { fmtKw, ASPECT_LABEL } from '../../lib/engine';
import { accuracy } from '../../lib/ai';
import { SourceChip } from '../kit';
import { AiInsightsRail } from './AiInsightsRail';
import { Eyebrow, KvList, Muted, fmtParam, monthYear, n0, paramDef, pct, type PlanView } from './shared';

const DECISION_TONE = { Pending: 'warning', Approved: 'success', 'Approved with conditions': 'success', Rejected: 'error' } as const;
const PHASE_TONE = { Planned: 'neutral', Approved: 'info', 'In delivery': 'cyan', Live: 'success' } as const;
/** Fixed-order hues for the demand mix (identity, never cycled). */
const MIX = [
  { key: 'gpuPct', label: 'GPU', color: 'var(--vw-color-violet-500)' },
  { key: 'computePct', label: 'Compute', color: 'var(--vw-color-blue-500)' },
  { key: 'storagePct', label: 'Storage', color: 'var(--vw-color-cyan-500)' },
] as const;

export function OverviewTab({ v }: { v: PlanView }) {
  const { plan, ev, feedback } = v;
  const departures = useMemo(() => Object.entries(ev.params).filter(([, s]) => s.source === 'user' || s.source === 'ai' || s.source === 'document'), [ev.params]);
  const template = ev.resolved?.template;
  const outputs = useMemo(() => [...new Set((ev.resolved?.chain ?? []).flatMap(t => t.outputs))], [ev.resolved]);
  const generated = plan.status !== 'Draft';
  const approvals: T.PlannerApproval[] = plan.approvals.length ? plan.approvals : (template?.approvalPath ?? []).map(role => ({ step: role, role, decision: 'Pending' as const }));
  const planFeedback = useMemo(() => accuracy(feedback.filter(f => f.planId === plan.id)), [feedback, plan.id]);
  const sortedPhases = useMemo(() => [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)), [plan.phases]);

  return (
    <div className="vw-grid vw-gap-lg" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 360px)' }}>
      <div className="vw-flex vw-flex-col vw-gap-md">
        <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <VwCard title="Aspect coverage" extra={<VwChip variant={ev.readinessPct >= 80 ? 'success' : 'warning'}>{pct(ev.readinessPct)} ready</VwChip>}>
            <AspectRadar aspects={ev.aspects} size={260} />
            <div className="vw-flex vw-wrap vw-gap-xs" style={{ marginTop: 8 }}>
              {ev.aspects.filter(a => a.pct < 100).map(a => <VwChip key={a.aspect} variant={a.pct < 50 ? 'warning' : 'neutral'}>{ASPECT_LABEL[a.aspect]} {a.answered}/{a.total}</VwChip>)}
            </div>
          </VwCard>
          <VwCard title="Rule status" extra={<VwChip variant={ev.hardFails ? 'error' : ev.softWarns ? 'warning' : 'success'}>{ev.hardFails} fail · {ev.softWarns} warn</VwChip>}>
            <RuleGauge findings={ev.findings} size={260} />
            <div style={{ marginTop: 8 }}><Muted>{ev.findings.filter(f => f.status === 'pass').length} of {ev.findings.length} rules pass; binding constraint {ev.bindingConstraint === 'none' ? 'none' : ev.bindingConstraint}.</Muted></div>
          </VwCard>
        </div>

        <VwCard title="Intent" extra={plan.aiAssisted ? <VwChip variant="purple">AI assisted</VwChip> : undefined}>
          <div style={{ fontSize: 'var(--vw-font-label-md)', color: 'var(--vw-color-slate-900)', lineHeight: 1.5 }}>{plan.intent || 'No intent recorded.'}</div>
          <div className="vw-flex vw-wrap vw-gap-xs" style={{ marginTop: 8 }}>
            <VwChip variant="neutral">Requested by {plan.requestedBy}</VwChip>
            <VwChip variant="neutral">Climate {plan.climate}</VwChip>
            <VwChip variant="neutral">Tenancy {plan.demand.tenancy}</VwChip>
            <VwChip variant="neutral">Growth {plan.demand.growthPctPerYear}% a year</VwChip>
          </div>
        </VwCard>

        <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <VwCard title="Demand mix">
            <div className="vw-flex" style={{ height: 14, borderRadius: 'var(--vw-radius-sm)', overflow: 'hidden', gap: 2, background: 'var(--vw-color-slate-100)' }} role="img" aria-label={MIX.map(m => `${m.label} ${plan.demand[m.key]}%`).join(', ')}>
              {MIX.map(m => plan.demand[m.key] > 0 && <div key={m.key} style={{ width: `${plan.demand[m.key]}%`, background: m.color }} title={`${m.label} ${plan.demand[m.key]}%`} />)}
            </div>
            <div className="vw-flex vw-wrap vw-gap-md" style={{ marginTop: 8 }}>
              {MIX.map(m => <span key={m.key} className="vw-inline-flex vw-items-center vw-gap-xs" style={{ fontSize: 'var(--vw-font-label-sm)' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, display: 'inline-block' }} />{m.label} <strong>{plan.demand[m.key]}%</strong></span>)}
            </div>
            <div style={{ marginTop: 10 }}>
              <KvList items={[
                { label: 'Design density', value: `${plan.demand.densityKwPerRack} kW per rack` },
                { label: 'Rack classes', value: ev.sizing.rackClasses.map(c => `${c.name} ${c.racks} × ${c.kw} kW`).join(' · ') || '—' },
                { label: 'Growth', value: `${plan.demand.growthPctPerYear}% a year` },
              ]} />
            </div>
          </VwCard>
          <VwCard title="Phases" extra={<Muted>{sortedPhases.length} phase(s)</Muted>}>
            {sortedPhases.length === 0 && <div className="vw-card-description">No phases yet — the phasing optimiser can propose them.</div>}
            <div className="vw-flex vw-flex-col vw-gap-xs">
              {sortedPhases.map(ph => (
                <div key={ph.id} className="vw-flex vw-justify-between vw-items-center vw-gap-sm" style={{ borderBottom: '1px solid var(--vw-color-slate-100)', padding: '4px 0' }}>
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 500 }}>{ph.name}</div><Muted size="xs">{fmtKw(ph.itKw)} · {n0(ph.racks)} racks · {ph.halls} hall(s)</Muted></div>
                  <div className="vw-flex vw-items-center vw-gap-xs"><Muted size="xs">{monthYear(ph.goLive)}</Muted><VwChip variant={PHASE_TONE[ph.status]}>{ph.status}</VwChip></div>
                </div>
              ))}
            </div>
          </VwCard>
        </div>

        <VwCard title="Departures from template" extra={<Muted>{template?.name ?? 'No template'}{template ? ` v${template.version}` : ''}</Muted>}>
          {departures.length === 0 && <div className="vw-card-description">Every parameter is the template default.</div>}
          <div className="vw-flex vw-flex-col vw-gap-xs">
            {departures.map(([key, s]) => {
              const def = paramDef(ev, key);
              return (
                <div key={key} className="vw-flex vw-justify-between vw-items-center vw-gap-sm vw-wrap" style={{ borderBottom: '1px solid var(--vw-color-slate-100)', padding: '4px 0' }}>
                  <div style={{ minWidth: 0 }}><span style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 500 }}>{def?.label ?? key}</span> <Muted size="xs">{def?.default !== undefined ? `template ${fmtParam(def.default, def.unit)}` : 'no template default'}{s.note ? ` · ${s.note}` : ''}</Muted></div>
                  <span className="vw-inline-flex vw-items-center vw-gap-xs" style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtParam(s.value, def?.unit)} <SourceChip source={s.source} note={s.note} /></span>
                </div>
              );
            })}
          </div>
        </VwCard>

        <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <VwCard title="Approval path">
            {approvals.length === 0 && <div className="vw-card-description">No approval path on this template.</div>}
            <div className="vw-flex vw-flex-col vw-gap-xs">
              {approvals.map((a, i) => (
                <div key={a.step} className="vw-flex vw-gap-sm" style={{ padding: '4px 0' }}>
                  <div className="vw-flex vw-flex-col vw-items-center" style={{ width: 18, flexShrink: 0 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, marginTop: 4, background: a.decision === 'Pending' ? 'var(--vw-color-amber-500)' : a.decision === 'Rejected' ? 'var(--vw-color-red-500)' : 'var(--vw-color-green-500)' }} />
                    {i < approvals.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--vw-color-slate-200)', minHeight: 14 }} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm"><span style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 500 }}>{a.step}</span><VwChip variant={DECISION_TONE[a.decision]}>{a.decision}</VwChip></div>
                    <Muted size="xs">{a.role}{a.person ? ` · ${a.person}` : ''}{a.at ? ` · ${fmtDate(a.at)}` : ''}</Muted>
                    {a.conditions && <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-700)', marginTop: 2 }}>Conditions: {a.conditions}</div>}
                  </div>
                </div>
              ))}
            </div>
          </VwCard>
          <VwCard title="Deliverables" extra={<Muted>{generated ? `${outputs.length} generated` : `${outputs.length} pending`}</Muted>}>
            {outputs.length === 0 && <div className="vw-card-description">The template declares no outputs.</div>}
            <div className="vw-flex vw-flex-col vw-gap-xs">
              {outputs.map(o => (
                <div key={o} className="vw-flex vw-justify-between vw-items-center vw-gap-sm" style={{ borderBottom: '1px solid var(--vw-color-slate-100)', padding: '4px 0' }}>
                  <span style={{ fontSize: 'var(--vw-font-label-sm)' }}>{o}</span>
                  <VwChip variant={generated ? 'success' : 'neutral'}>{generated ? 'Generated' : 'Pending'}</VwChip>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}><Eyebrow>Executes as</Eyebrow><Muted>{template?.executesAs ?? '—'}{template?.blueprintKey ? ` · blueprint ${template.blueprintKey}` : ''}</Muted></div>
          </VwCard>
        </div>

        <VwCard title="AI feedback on this plan" extra={<Muted>{feedback.filter(f => f.planId === plan.id).length} decision(s)</Muted>}>
          {planFeedback.length === 0 && <div className="vw-card-description">No proposal has been accepted or rejected on this plan yet.</div>}
          <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {planFeedback.map(c => (
              <div key={c.capability} className="vw-card-child" style={{ padding: '8px 12px' }}>
                <Eyebrow>{c.label}</Eyebrow>
                <div style={{ fontSize: 'var(--vw-font-label-lg)', fontWeight: 600, color: c.pct >= 70 ? 'var(--vw-color-green-600)' : c.pct >= 40 ? 'var(--vw-color-amber-600)' : 'var(--vw-color-red-600)' }}>{c.pct}%</div>
                <Muted size="xs">{c.accepted} of {c.total} accepted</Muted>
              </div>
            ))}
          </div>
        </VwCard>
      </div>
      <AiInsightsRail v={v} />
    </div>
  );
}
