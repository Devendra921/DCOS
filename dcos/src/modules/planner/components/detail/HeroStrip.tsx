/* Summary strip: the six figures a reviewer reads first, for the base case or a scenario. */
import { Select } from 'antd';
import { StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import { fmtUsd, fmtKw } from '../../lib/engine';
import { n0, pct, type PlanView } from './shared';

export function HeroStrip({ v, viewKey, onView }: { v: PlanView; viewKey: string; onView: (key: string) => void }) {
  const { ev, plan, scenarios } = v;
  const est = ev.estimate, s = ev.sizing;
  const preferredId = plan.approvedScenarioId ?? plan.preferredScenarioId;
  const options = [{ label: 'Base case', value: 'base' }, ...scenarios.map(x => ({ label: `${x.scenario.name}${x.scenario.id === preferredId ? ' (preferred)' : ''}`, value: x.scenario.id }))];
  const benefit = est.benefitAnnual ?? 0;
  const payback = est.paybackMonths;
  const checks = ev.hardFails ? `${ev.hardFails} failing` : ev.softWarns ? `${ev.softWarns} warning${ev.softWarns === 1 ? '' : 's'}` : 'All pass';
  const applicable = ev.findings.filter(f => f.status !== 'n/a').length;
  const checkColor = ev.hardFails ? 'var(--vw-color-red-600)' : ev.softWarns ? 'var(--vw-color-amber-700)' : 'var(--vw-color-green-700)';
  return (
    <div className="col" style={{ gap: 8 }}>
      {scenarios.length > 0 && (
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <span className="vw-label">Figures for</span>
          <Select size="small" value={viewKey} onChange={onView} options={options} style={{ minWidth: 220 }} aria-label="Show the figures of the base case or a scenario" />
        </div>
      )}
      <StatGrid>
        <StatTile label="IT capacity" value={fmtKw(s.itKw)} sub={s.racks ? `${n0(s.racks)} racks` : undefined} />
        <StatTile label="Capital cost" value={fmtUsd(est.capexTotal)} sub={s.itKw ? `${fmtUsd(est.capexPerKw)} per kW` : undefined} />
        <StatTile label="Running cost" value={fmtUsd(est.opexMonthly)} sub="per month" />
        <StatTile label="Payback" value={payback === null ? '—' : `${payback} months`} subTone={payback !== null && payback > 96 ? 'warn' : undefined}
          sub={benefit ? `${fmtUsd(benefit)} a year saved` : payback === null ? 'no revenue or saving set' : est.npvUsd !== undefined ? `NPV ${fmtUsd(est.npvUsd)}` : undefined} />
        <StatTile label="Checks" value={<span style={{ color: checkColor }}>{checks}</span>} sub={`${applicable} checks apply`} subTone={ev.hardFails ? 'bad' : ev.softWarns ? 'warn' : undefined} />
        <StatTile label="Inputs confirmed" value={pct(ev.readinessPct)} sub={`across ${ev.aspects.length} areas`} />
      </StatGrid>
    </div>
  );
}
