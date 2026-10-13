/* Summary bar: the six figures a reviewer reads first, for the base case or a scenario. */
import type { ReactNode } from 'react';
import { Select } from 'antd';
import { fmtUsd, fmtKw } from '../../lib/engine';
import { n0, pct, type PlanView } from './shared';

function Figure({ label, value, sub, tone, first }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn' | 'ok'; first?: boolean }) {
  const color = tone === 'bad' ? 'var(--vw-color-red-600)' : tone === 'warn' ? 'var(--vw-color-amber-700)' : tone === 'ok' ? 'var(--vw-color-green-700)' : 'var(--vw-color-slate-900)';
  return (
    <div style={{ minWidth: 0, padding: '2px 20px', borderLeft: first ? undefined : '1px solid var(--vw-color-slate-200)', paddingLeft: first ? 0 : 20 }}>
      <div className="vw-card-metric-label-sub">{label}</div>
      <div style={{ fontSize: 'var(--vw-font-value-lg)', fontWeight: 500, color, lineHeight: 1.25, marginTop: 6, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-500)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  );
}

export function HeroStrip({ v, viewKey, onView }: { v: PlanView; viewKey: string; onView: (key: string) => void }) {
  const { ev, plan, scenarios } = v;
  const est = ev.estimate, s = ev.sizing;
  const preferredId = plan.approvedScenarioId ?? plan.preferredScenarioId;
  const options = [{ label: 'Base case', value: 'base' }, ...scenarios.map(x => ({ label: `${x.scenario.name}${x.scenario.id === preferredId ? ' (preferred)' : ''}`, value: x.scenario.id }))];
  const benefit = est.benefitAnnual ?? 0;
  const payback = est.paybackMonths;
  const checks = ev.hardFails ? `${ev.hardFails} failing` : ev.softWarns ? `${ev.softWarns} warning${ev.softWarns === 1 ? '' : 's'}` : 'All pass';
  const applicable = ev.findings.filter(f => f.status !== 'n/a').length;
  return (
    <div className="vw-card-section vw-flex vw-flex-col vw-gap-md">
      <div className="vw-flex vw-items-center vw-justify-between vw-gap-sm">
        <span className="vw-card-title">Summary</span>
        {scenarios.length > 0 && (
          <span className="vw-flex vw-items-center vw-gap-sm">
            <span className="vw-card-metric-label-sub">Figures for</span>
            <Select size="small" value={viewKey} onChange={onView} options={options} style={{ minWidth: 220 }} aria-label="Show the figures of the base case or a scenario" />
          </span>
        )}
      </div>
      <div className="vw-grid" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
        <Figure first label="IT capacity" value={fmtKw(s.itKw)} sub={s.racks ? `${n0(s.racks)} racks` : undefined} />
        <Figure label="Capital cost" value={fmtUsd(est.capexTotal)} sub={s.itKw ? `${fmtUsd(est.capexPerKw)} per kW` : undefined} />
        <Figure label="Running cost" value={`${fmtUsd(est.opexMonthly)}`} sub="per month" />
        <Figure label="Payback" value={payback === null ? '—' : `${payback} months`} sub={benefit ? `${fmtUsd(benefit)} a year saved` : payback === null ? 'no revenue or saving set' : est.npvUsd !== undefined ? `NPV ${fmtUsd(est.npvUsd)}` : undefined} tone={payback !== null && payback > 96 ? 'warn' : undefined} />
        <Figure label="Checks" value={checks} sub={`${applicable} checks apply`} tone={ev.hardFails ? 'bad' : ev.softWarns ? 'warn' : 'ok'} />
        <Figure label="Inputs confirmed" value={pct(ev.readinessPct)} sub={`across ${ev.aspects.length} areas`} />
      </div>
    </div>
  );
}
