/* Cost step: CapEx and OpEx with every line's basis and source, the cash flow, and the estimate against the benchmark band. */
import { useState } from 'react';
import { VwChip, VwSegmented } from '../../../../shared/components/ux';
import { fmtUsd } from '../../lib/engine';
import { CashflowChart, CostBreakdownChart } from '../charts';
import { SourceChip, Stat } from '../kit';
import type { StepProps } from './wizardModel';
import { SubTitle } from './ParamField';


export function CostPanel(props: StepProps) {
  const { ev } = props;
  const [mode, setMode] = useState<'capex' | 'opex'>('capex');
  const est = ev?.estimate;
  const lines = mode === 'capex' ? est?.capex ?? [] : est?.opex ?? [];

  return (
    <div>
      {est && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
          <Stat label="CapEx" value={fmtUsd(est.capexTotal)} sub={<span>{fmtUsd(est.capexPerKw)}/kW MEP and fit-out <SourceChip source={est.capex[0]?.source ?? 'benchmark'} /></span>} />
          <Stat label="Per rack" value={fmtUsd(est.capexPerRack)} sub={`all-in${est.it ? ' including IT' : ''}; contingency ${fmtUsd(est.contingencyUsd ?? 0)}`} />
          <Stat label="OpEx / month" value={fmtUsd(est.opexMonthly)} sub={`${fmtUsd(est.opexAnnual)} a year at steady state`} />
          <Stat label="Per kW-month" value={fmtUsd(est.costPerKwMonth)} sub={`${est.energyMwhYear.toLocaleString('en-US')} MWh a year`} />
          <Stat label="NPV" value={est.npvUsd === undefined ? '—' : fmtUsd(est.npvUsd)} tone={est.npvUsd === undefined ? undefined : est.npvUsd >= 0 ? 'ok' : 'bad'} sub={`at the ${est.discountPct ?? '—'}% hurdle rate`} />
          <Stat label="IRR" value={est.irrPct == null ? '—' : `${est.irrPct}%`} tone={est.irrPct == null ? 'warn' : est.irrPct >= (est.discountPct ?? 8) ? 'ok' : 'warn'} sub={est.irrPct == null ? 'never turns positive' : 'over the horizon'} />
          <Stat label="Payback" value={est.paybackMonths == null ? '—' : `${est.paybackMonths} mo`} tone={est.paybackMonths == null ? 'warn' : est.paybackMonths > 96 ? 'warn' : 'ok'} sub={est.paybackFacilityMonths !== undefined ? `facility only ${est.paybackFacilityMonths === null ? 'none' : `${est.paybackFacilityMonths} mo`}` : est.paybackMonths == null ? 'no payback within the horizon' : 'from the first spend'} />
          <Stat label="Revenue / year" value={fmtUsd(est.revenueAnnual)} sub={est.energyRecoveredAnnual ? `+ ${fmtUsd(est.energyRecoveredAnnual)} energy recovered` : 'at target fill, steady state'} />
        </div>
      )}
      {(est?.notes ?? []).length > 0 && <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--vw-color-slate-600)' }}>{est!.notes!.map(n => <div key={n}>· {n}</div>)}</div>}
      {est?.cashflow && est.cashflow.length > 0 && (<>
        <SubTitle>Cash flow by year</SubTitle>
        <CashflowChart years={est.cashflow} height={200} />
        <div className="vw-card-description" style={{ fontSize: 12, marginBottom: 8 }}>{est.paybackBasis}</div>
      </>)}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <SubTitle extra={<VwSegmented size="small" value={mode} onChange={setMode} options={[{ value: 'capex', label: 'CapEx' }, { value: 'opex', label: 'OpEx' }]} />}>Breakdown</SubTitle>
          {est && <CostBreakdownChart estimate={est} mode={mode} height={220} />}
          <div className="nst-table-wrap" style={{ marginTop: 8 }}><table className="nst-table" style={{ width: '100%' }}>
            <thead><tr><th>Line</th><th style={{ textAlign: 'right' }}>{mode === 'capex' ? 'USD' : 'USD / month'}</th><th>Basis</th><th>Source</th></tr></thead>
            <tbody>{lines.map((l, i) => <tr key={i}><td style={{ fontWeight: 500 }}>{l.item}</td><td style={{ textAlign: 'right' }}>{l.amount.toLocaleString('en-US')}</td><td style={{ fontSize: 12, color: 'var(--vw-color-slate-600)', whiteSpace: 'normal' }}>{l.basis}</td><td><SourceChip source={l.source} /></td></tr>)}</tbody>
            <tfoot><tr><td style={{ fontWeight: 600 }}>Total</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{(mode === 'capex' ? est?.capexTotal ?? 0 : est?.opexMonthly ?? 0).toLocaleString('en-US')}</td><td colSpan={2}>{mode === 'capex' && est?.benchmarkBand && <span style={{ fontSize: 12 }}>Benchmark band {fmtUsd(est.benchmarkBand.low)} to {fmtUsd(est.benchmarkBand.high)} per kW · <SourceChip source="benchmark" note={est.benchmarkBand.source} /></span>}</td></tr></tfoot>
          </table></div>
        </div>
        <div style={{ minWidth: 0 }}>
          <SubTitle>Against the benchmark</SubTitle>
          {est?.benchmarkBand ? (
            <div className="vw-card-child" style={{ padding: '10px 12px', fontSize: 'var(--vw-font-label-sm)' }}>
              <div className="vw-flex vw-justify-between" style={{ padding: '4px 0' }}><span style={{ color: 'var(--vw-color-slate-500)' }}>This plan</span><strong>{fmtUsd(est.capexPerKw)} per kW</strong></div>
              <div className="vw-flex vw-justify-between" style={{ padding: '4px 0' }}><span style={{ color: 'var(--vw-color-slate-500)' }}>Benchmark band <SourceChip source="benchmark" note={est.benchmarkBand.source} /></span><span>{fmtUsd(est.benchmarkBand.low)} to {fmtUsd(est.benchmarkBand.high)} per kW</span></div>
            </div>
          ) : <div className="vw-card-description">This plan type is costed bottom-up from its bill of materials; there is no per-kW benchmark to compare with.</div>}
          {est?.benchmarkBand && <div style={{ marginTop: 8, fontSize: 12 }}><VwChip variant={est.capexPerKw < est.benchmarkBand.low * 0.85 ? 'warning' : est.capexPerKw > est.benchmarkBand.high * 1.1 ? 'warning' : 'success'}>{est.capexPerKw < est.benchmarkBand.low * 0.85 ? 'Below band' : est.capexPerKw > est.benchmarkBand.high * 1.1 ? 'Above band' : 'Inside band'}</VwChip></div>}
        </div>
      </div>
    </div>
  );
}
