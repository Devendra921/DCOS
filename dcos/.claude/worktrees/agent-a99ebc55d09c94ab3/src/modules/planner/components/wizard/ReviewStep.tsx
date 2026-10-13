/* Step 10 — Review and submit: headline numbers, aspect coverage, departures from the template, what the plan produces, approval path, and the blocking checklist. */
import { useMemo } from 'react';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { CheckCircleOutlined, CloseCircleFilled, WarningOutlined } from '../../../../shared/icons';
import { fmtKw, fmtUsd, SCOPE_LABEL } from '../../lib/engine';
import { AspectRadar } from '../charts';
import { ScopeChip, SourceChip, Stat } from '../kit';
import { blockers, CLIMATE_LABEL, COOLING_LABEL, fmtDate, paramDefsFor, stepsFor, type StepProps } from './wizardModel';
import { StepTitle, SubTitle } from './ParamField';
import { buildPack, packSummary, sourcingReady } from '../outputs/packModel';
import { useSourcingContext } from '../../lib/usePlanner';
import * as G from '../../lib/governance';
import type * as T from '../../../../mock/data/types';

export function ReviewStep({ draft, ev, templates, benchmarks, estate, goTo, actions, data }: StepProps) {
  const defs = useMemo(() => paramDefsFor(ev, templates, draft.dcTypeKey), [ev, templates, draft.dcTypeKey]);
  const template = ev?.resolved?.template;
  const departures = useMemo(() => Object.entries(ev?.params ?? {}).filter(([k, v]) => (v.source === 'user' || v.source === 'ai' || v.source === 'document') && defs.has(k)), [ev, defs]);
  const list = useMemo(() => blockers(draft, ev, template, data), [draft, ev, template, data]);
  const dc = estate.dataCenters.find(d => d.id === draft.dataCenterId);
  const siteName = dc?.name ?? (draft.newSiteName || 'New site');
  const sourcingCtx = useSourcingContext();
  const sourcing = sourcingReady(sourcingCtx) ? sourcingCtx : undefined;
  const produces = useMemo(() => (ev ? packSummary(buildPack(draft, ev, template, benchmarks, siteName, sourcing)) : []), [draft, ev, template, benchmarks, siteName, sourcing]);
  const amount = useMemo(() => (ev ? G.approvalAmount(ev) : { amountUsd: 0, itUsd: 0 }), [ev]);
  const path = useMemo(() => G.buildApprovalPath(template, amount.amountUsd, amount.itUsd), [template, amount]);
  const fmtVal = (k: string, v: unknown) => (k === 'coolingType' ? COOLING_LABEL[v as T.PlannerCoolingType] ?? String(v) : typeof v === 'number' ? `${v.toLocaleString('en-US')}${defs.get(k)?.unit ? ` ${defs.get(k)!.unit}` : ''}` : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));

  return (
    <div>
      <StepTitle title="Review and submit" description="What the plan says, where it departs from the standard, what will be generated, and who approves it. Submitting moves the plan to In review and opens the approval steps." />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, fontSize: 13 }}>
        <strong style={{ fontSize: 15 }}>{draft.title || 'Untitled plan'}</strong><ScopeChip scope={draft.scope} /><VwChip variant="neutral">{ev?.resolved?.template.name ?? 'No template'}</VwChip><VwChip variant="neutral">{dc ? `${dc.code} · ${dc.name}` : draft.newSiteName ? `New site ${draft.newSiteName}` : 'No site'}</VwChip><VwChip variant="neutral">{CLIMATE_LABEL[draft.climate]}</VwChip><VwChip variant="neutral">Go-live {fmtDate(draft.targetGoLive)}</VwChip>
      </div>
      {ev && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
          <Stat label="IT power" value={fmtKw(ev.sizing.itKw)} sub={`${draft.phases.length} phase${draft.phases.length === 1 ? '' : 's'}`} />
          <Stat label="Racks / halls" value={`${ev.sizing.racks.toLocaleString('en-US')} / ${ev.sizing.halls}`} sub={`${ev.params['densityKwPerRack']?.value ?? '—'} kW per rack`} />
          <Stat label="CapEx" value={fmtUsd(ev.estimate.capexTotal)} sub={`${fmtUsd(ev.estimate.capexPerKw)}/kW plant`} />
          <Stat label="OpEx / month" value={fmtUsd(ev.estimate.opexMonthly)} sub={`PUE ${ev.sizing.pue.value}`} />
          <Stat label="Payback" value={ev.estimate.paybackMonths === null ? '—' : `${ev.estimate.paybackMonths} mo`} tone={ev.estimate.paybackMonths !== null && ev.estimate.paybackMonths <= 96 ? 'ok' : 'warn'} />
          <Stat label="Readiness" value={`${ev.readinessPct}%`} tone={ev.hardFails ? 'bad' : ev.softWarns ? 'warn' : 'ok'} sub={`${ev.hardFails} fail, ${ev.softWarns} warn`} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 12, marginTop: 12 }}>
        <VwCard variant="child" title="Aspect coverage">
          {ev && <AspectRadar aspects={ev.aspects} size={220} />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>{ev?.aspects.filter(a => a.pct < 100).map(a => <VwChip key={a.aspect} variant="warning" style={{ fontSize: 10 }}>{a.aspect} {a.pct}%</VwChip>)}</div>
        </VwCard>
        <VwCard variant="child" title={<span>Departures from the template <VwChip variant="neutral">{departures.length}</VwChip></span>}>
          <div style={{ maxHeight: 260, overflowY: 'auto', fontSize: 12 }}>
            {departures.length === 0 && <div className="vw-card-description">Every parameter is the template default.</div>}
            {departures.map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--vw-color-slate-100)' }}><span style={{ color: 'var(--vw-color-slate-700)' }}>{defs.get(k)?.label ?? k}</span><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}><strong>{fmtVal(k, v.value)}</strong><SourceChip source={v.source} note={v.note} /></span></div>)}
          </div>
        </VwCard>
        <VwCard variant="child" title="What this plan produces">
          <div style={{ fontSize: 12 }}>
            {produces.map(o => <div key={o.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--vw-color-slate-100)' }}><span style={{ color: o.applies ? 'var(--vw-color-slate-900)' : 'var(--vw-color-slate-500)' }}>{o.label}</span><span style={{ color: 'var(--vw-color-slate-600)', textAlign: 'right' }}>{o.detail}</span></div>)}
            {produces.length === 0 && <div className="vw-card-description">Pick a plan type and size the plan to see what it produces.</div>}
            {produces.length > 0 && <div style={{ marginTop: 6, color: 'var(--vw-color-slate-500)' }}>The full pack (document, bill of materials, IP plan, drawings and initiation) is on the plan page under Plan pack once the plan is saved.</div>}
          </div>
          <SubTitle>Approval path</SubTitle>
          <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)', marginBottom: 4 }}>Routed on {fmtUsd(amount.amountUsd)} CapEx{amount.itUsd > 0 ? ` (incl. ${fmtUsd(amount.itUsd)} owned IT)` : ''}: {G.bandLabel(path.band)}. Built exactly like this when you submit; the preferred scenario's CapEx is used if you prefer one.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            {path.approvals.map(a => (
              <div key={a.step} style={{ borderBottom: '1px solid var(--vw-color-slate-100)', padding: '3px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><strong>{a.order}. {a.step}</strong><span style={{ color: 'var(--vw-color-slate-600)' }}>{a.role}</span></div>
                <div style={{ color: 'var(--vw-color-slate-500)' }}>Can approve: {G.peopleWithRole(a.role).map(p => p.name).join(', ') || 'nobody holds this role yet'}{G.peopleWithRole(a.role).some(p => p.name === draft.requestedBy || p.name === actions.actor) ? ' (not you or the requester: segregation of duties)' : ''}</div>
              </div>
            ))}
          </div>
          {template?.executesAs && <div style={{ fontSize: 12, marginTop: 8, color: 'var(--vw-color-slate-600)' }}>Once approved this plan executes as a <strong>{template.executesAs}</strong>{template.blueprintKey ? ` from the ${template.blueprintKey} blueprint` : ''}.</div>}
        </VwCard>
      </div>

      <SubTitle>Checklist</SubTitle>
      <VwCard variant="child-shaded">
        {list.length === 0 && <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--vw-color-green-600)' }}><CheckCircleOutlined /> Nothing blocks submission.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {list.map((b, i) => <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><span style={{ color: b.level === 'bad' ? 'var(--vw-color-red-600)' : 'var(--vw-color-amber-500)' }}>{b.level === 'bad' ? <CloseCircleFilled /> : <WarningOutlined />}</span><span style={{ flex: 1 }}>{b.text}</span><a style={{ fontSize: 12 }} onClick={() => goTo(b.step)}>Fix in {stepsFor(template).find(s => s.key === b.step)?.label ?? SCOPE_LABEL[draft.scope]}</a></div>)}
        </div>
      </VwCard>
    </div>
  );
}
