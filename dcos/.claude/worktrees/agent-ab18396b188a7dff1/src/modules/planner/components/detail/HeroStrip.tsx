/* Hero strip: the headline figures of the evaluation on show, plus the base/scenario switcher. */
import { VwSegmented } from '../../../../shared/components/ux';
import { fmtUsd, fmtKw } from '../../lib/engine';
import { SourceChip, Stat } from '../kit';
import { n0, pct, type PlanView } from './shared';

export function HeroStrip({ v, viewKey, onView }: { v: PlanView; viewKey: string; onView: (key: string) => void }) {
  const { ev, plan, scenarios } = v;
  const est = ev.estimate, s = ev.sizing;
  const preferred = scenarios.find(x => x.scenario.id === plan.preferredScenarioId);
  const options = [{ label: 'Base case', value: 'base' }, ...scenarios.map(x => ({ label: x.scenario.name, value: x.scenario.id }))];
  return (
    <div className="vw-card-section vw-flex vw-flex-col vw-gap-sm">
      <div className="vw-flex vw-items-center vw-justify-between vw-gap-sm vw-wrap">
        <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)' }}>
          Preferred scenario: <strong style={{ color: 'var(--vw-color-slate-900)' }}>{preferred?.scenario.name ?? 'Base case'}</strong>
          {v.viewScenario && v.viewScenario.id !== plan.preferredScenarioId && <span> · showing <strong style={{ color: 'var(--vw-color-slate-900)' }}>{v.viewScenario.name}</strong></span>}
        </div>
        <VwSegmented size="small" value={viewKey} onChange={onView} options={options} />
      </div>
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))' }}>
        <Stat label="IT capacity" value={fmtKw(s.itKw)} sub={`${s.rackClasses.length} rack class(es)`} />
        <Stat label="Racks" value={n0(s.racks)} sub={`${ev.params['densityKwPerRack']?.value ?? '—'} kW per rack`} />
        <Stat label="Halls / buildings" value={`${s.halls} / ${s.buildings}`} sub={`${n0(s.whiteSpaceM2)} m² white space`} />
        <Stat label="CapEx" value={fmtUsd(est.capexTotal)} sub={`${fmtUsd(est.capexPerKw)} per kW`} />
        <Stat label="OpEx / month" value={fmtUsd(est.opexMonthly)} sub={`${fmtUsd(est.costPerKwMonth)} per kW-month`} />
        <Stat label="PUE" value={<span className="vw-inline-flex vw-items-center vw-gap-xs">{s.pue.value} <SourceChip source={s.pue.source} note={s.pue.note} /></span>} sub={`${n0(est.energyMwhYear)} MWh a year`} />
        <Stat label="Payback" value={est.paybackMonths === null ? '—' : `${est.paybackMonths} mo`} sub={plan.revenuePerKwMonth ? `at $${plan.revenuePerKwMonth}/kW-month` : 'no revenue set'} tone={est.paybackMonths !== null && est.paybackMonths > 96 ? 'warn' : undefined} />
        <Stat label="Readiness" value={pct(ev.readinessPct)} sub={`${ev.aspects.length} aspects`} tone={ev.readinessPct >= 80 ? 'ok' : ev.readinessPct >= 50 ? 'warn' : 'bad'} />
        <Stat label="Rules" value={ev.hardFails ? `${ev.hardFails} fail` : 'Pass'} sub={`${ev.softWarns} warning(s)`} tone={ev.hardFails ? 'bad' : ev.softWarns ? 'warn' : 'ok'} />
      </div>
    </div>
  );
}
