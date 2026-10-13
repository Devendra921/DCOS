/* Step 10 — Review and submit: headline numbers, aspect coverage, departures from the template, what the plan produces, approval path, and the blocking checklist. */
import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, GitCompare, ListChecks, PackageOpen, Radar, XCircle } from 'lucide-react';
import { Chip, Panel } from '../../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import { fmtKw, fmtUsd, SCOPE_LABEL } from '../../lib/engine';
import { AspectRadar } from '../charts';
import { ScopeChip, SourceChip } from '../kit';
import { ToneValue } from '../detail/shared';
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
      <div className="row wrap" style={{ marginBottom: 10, fontSize: 13 }}>
        <strong className="strong" style={{ fontSize: 16 }}>{draft.title || 'Untitled plan'}</strong><ScopeChip scope={draft.scope} /><Chip tone="neutral">{ev?.resolved?.template.name ?? 'No template'}</Chip><Chip tone="neutral">{dc ? `${dc.code} · ${dc.name}` : draft.newSiteName ? `New site ${draft.newSiteName}` : 'No site'}</Chip><Chip tone="neutral">{CLIMATE_LABEL[draft.climate]}</Chip><Chip tone="neutral">Go-live {fmtDate(draft.targetGoLive)}</Chip>
      </div>
      {ev && (
        <StatGrid>
          <StatTile label="IT power" value={fmtKw(ev.sizing.itKw)} sub={`${draft.phases.length} phase${draft.phases.length === 1 ? '' : 's'}`} />
          <StatTile label="Racks / halls" value={`${ev.sizing.racks.toLocaleString('en-US')} / ${ev.sizing.halls}`} sub={`${ev.params['densityKwPerRack']?.value ?? '—'} kW per rack`} />
          <StatTile label="CapEx" value={fmtUsd(ev.estimate.capexTotal)} sub={`${fmtUsd(ev.estimate.capexPerKw)}/kW plant`} />
          <StatTile label="OpEx / month" value={fmtUsd(ev.estimate.opexMonthly)} sub={`PUE ${ev.sizing.pue.value}`} />
          <StatTile label="Payback" value={<ToneValue tone={ev.estimate.paybackMonths !== null && ev.estimate.paybackMonths <= 96 ? 'ok' : 'warn'}>{ev.estimate.paybackMonths === null ? '—' : `${ev.estimate.paybackMonths} mo`}</ToneValue>} />
          <StatTile label="Readiness" value={<ToneValue tone={ev.hardFails ? 'bad' : ev.softWarns ? 'warn' : 'ok'}>{`${ev.readinessPct}%`}</ToneValue>} sub={`${ev.hardFails} fail, ${ev.softWarns} warn`} subTone={ev.hardFails ? 'bad' : ev.softWarns ? 'warn' : undefined} />
        </StatGrid>
      )}

      <div className="grid g-3" style={{ gap: 12, marginTop: 12 }}>
        <Panel icon={Radar} title="Aspect coverage">
          {ev && <AspectRadar aspects={ev.aspects} size={220} />}
          <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>{ev?.aspects.filter(a => a.pct < 100).map(a => <Chip key={a.aspect} tone="warning" size="xs">{a.aspect} {a.pct}%</Chip>)}</div>
        </Panel>
        <Panel icon={GitCompare} title="Departures from the template" count={departures.length}>
          <div style={{ maxHeight: 260, overflowY: 'auto', fontSize: 12 }}>
            {departures.length === 0 && <div className="vw-label">Every parameter is the template default.</div>}
            {departures.map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--vw-color-slate-100)' }}><span style={{ color: 'var(--vw-color-slate-700)' }}>{defs.get(k)?.label ?? k}</span><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}><strong>{fmtVal(k, v.value)}</strong><SourceChip source={v.source} note={v.note} /></span></div>)}
          </div>
        </Panel>
        <Panel icon={PackageOpen} title="What this plan produces">
          <div style={{ fontSize: 12 }}>
            {produces.map(o => <div key={o.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--vw-color-slate-100)' }}><span style={{ color: o.applies ? 'var(--vw-color-slate-900)' : 'var(--vw-color-slate-500)' }}>{o.label}</span><span style={{ color: 'var(--vw-color-slate-600)', textAlign: 'right' }}>{o.detail}</span></div>)}
            {produces.length === 0 && <div className="vw-label">Pick a plan type and size the plan to see what it produces.</div>}
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
        </Panel>
      </div>

      <Panel icon={ListChecks} title="Checklist" count={list.length} style={{ marginTop: 16 }}>
        {list.length === 0 && <div className="note note--good" style={{ alignItems: 'center' }}><CheckCircle2 size={16} /> Nothing blocks submission.</div>}
        <div className="col" style={{ gap: 6 }}>
          {list.map((b, i) => <div key={i} className={`note ${b.level === 'bad' ? 'note--bad' : 'note--warn'}`} style={{ alignItems: 'center', fontSize: 13 }}>{b.level === 'bad' ? <XCircle size={16} style={{ flex: 'none' }} /> : <AlertTriangle size={16} style={{ flex: 'none' }} />}<span style={{ flex: 1 }}>{b.text}</span><a style={{ fontSize: 12 }} onClick={() => goTo(b.step)}>Fix in {stepsFor(template).find(s => s.key === b.step)?.label ?? SCOPE_LABEL[draft.scope]}</a></div>)}
        </div>
      </Panel>
    </div>
  );
}
