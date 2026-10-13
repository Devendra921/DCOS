/* Sticky right rail — the draft re-evaluated on every change, each figure with its source. */
import { VwChip } from '../../../../shared/components/ux';
import type * as T from '../../../../mock/data/types';
import { fmtKw, fmtUsd, type Evaluation } from '../../lib/engine';
import { SourceChip } from '../kit';

function Row({ label, value, source, note, tone }: { label: string; value: React.ReactNode; source?: T.PlannerParamSource; note?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'var(--vw-color-red-600)' : tone === 'warn' ? 'var(--vw-color-amber-600)' : tone === 'ok' ? 'var(--vw-color-green-600)' : 'var(--vw-color-slate-900)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--vw-color-slate-100)' }}>
      <span style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ fontWeight: 600, fontSize: 14, color }}>{value}</span>{source && <SourceChip source={source} note={note} />}</span>
    </div>
  );
}

export function LiveEstimateRail({ draft, ev }: { draft: T.PlannerPlan; ev?: Evaluation }) {
  if (!ev) return <div className="vw-card-section" style={{ padding: 16 }}><div className="vw-card-title-sm">Live estimate</div><div className="vw-card-description">Evaluating the draft…</div></div>;
  const s = ev.sizing; const e = ev.estimate;
  const capexSource = ev.params['capexPerKw']?.source ?? e.capex[0]?.source ?? 'benchmark';
  const site = ev.ctx.site;
  const loading = !!draft.dataCenterId && !ev.ctx.data?.ready;
  return (
    <div className="vw-card-section" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><div className="vw-card-title-sm">Live estimate</div><VwChip variant={ev.hardFails ? 'error' : ev.softWarns ? 'warning' : 'success'}>{ev.hardFails ? `${ev.hardFails} fail` : ev.softWarns ? `${ev.softWarns} warn` : 'Clean'}</VwChip></div>
      {site && <Row label={`Free at ${site.dc.code}`} value={fmtKw(site.headroomItKw)} source="actual" note={`${site.binding?.label ?? 'no stage'} binds; live draw ${fmtKw(site.itLoadKw)}, holds ${fmtKw(site.reservedKw)}, approved plans ${fmtKw(site.pipelineKw)}`} tone={site.headroomItKw >= s.itKw ? 'ok' : 'bad'} />}
      {loading && <Row label="Site headroom" value="loading…" />}
      <Row label="IT power" value={fmtKw(s.itKw)} source="user" />
      {s.facility && s.plant.some(x => x.kind === 'feed') && <Row label="Facility load" value={`${s.facility.mva} MVA`} note={`${fmtKw(s.facility.facilityKw)} = IT × peak PUE ${s.facility.peakPue}`} source={s.pue.source} />}
      <Row label="Racks" value={s.racks.toLocaleString('en-US')} source={ev.params['densityKwPerRack']?.source ?? 'template'} note={`${ev.params['densityKwPerRack']?.value ?? 12} kW per rack`} />
      <Row label="Halls / buildings" value={`${s.halls} / ${s.buildings}`} source={ev.params['hallDesignKw']?.source ?? 'template'} note={`${ev.params['hallDesignKw']?.value ?? 1500} kW per hall`} />
      <Row label="CapEx" value={fmtUsd(e.capexTotal)} source={capexSource} note={`${fmtUsd(e.capexPerKw)} per kW plant and fit-out`} />
      <Row label="OpEx / month" value={fmtUsd(e.opexMonthly)} source={s.pue.source} note={`${fmtUsd(e.costPerKwMonth)} per kW-month`} />
      <Row label="PUE" value={s.pue.value} source={s.pue.source} note={s.pue.note} />
      <Row label="Payback" value={e.paybackMonths == null ? '—' : `${e.paybackMonths} mo`} source={ev.params['revenuePerKwMonth']?.source} note={e.paybackBasis} tone={e.paybackMonths == null ? 'warn' : e.paybackMonths > 96 ? 'warn' : 'ok'} />
      {e.npvUsd !== undefined && <Row label="NPV / IRR" value={`${fmtUsd(e.npvUsd)} / ${e.irrPct == null ? '—' : `${e.irrPct}%`}`} note={`at ${e.discountPct}% hurdle rate`} tone={e.npvUsd >= 0 ? 'ok' : 'warn'} />}
      <Row label="Hard fails" value={ev.hardFails} tone={ev.hardFails ? 'bad' : 'ok'} />
      <Row label="Warnings" value={ev.softWarns} tone={ev.softWarns ? 'warn' : 'ok'} />
      <Row label="Readiness" value={`${ev.readinessPct}%`} note="inputs confirmed by you, your requirements, a benchmark, an actual or a document; untouched template defaults do not count" tone={ev.readinessPct >= 80 ? 'ok' : ev.readinessPct >= 50 ? 'warn' : 'bad'} />
      {!!ev.defaultsCount && <Row label="Still on template defaults" value={ev.defaultsCount} tone="warn" />}
      {ev.bindingConstraint !== 'none' && <div style={{ marginTop: 8, fontSize: 12 }}><VwChip variant="warning">{ev.bindingConstraint} binds first</VwChip></div>}
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--vw-color-slate-500)' }}>{ev.resolved?.template.name ?? 'No template'} · {draft.phases.length} phase{draft.phases.length === 1 ? '' : 's'} · {ev.findings.length} rules checked</div>
    </div>
  );
}
