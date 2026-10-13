/* Step 7 — Cost: CapEx and OpEx envelope with every line's basis and source, the finance parameters, and the cost calibration against benchmark and delivered programmes. */
import { useMemo, useState } from 'react';
import { AIInsightCard, VwCard, VwChip, VwSegmented } from '../../../../shared/components/ux';
import { RobotOutlined } from '../../../../shared/icons';
import { fmtUsd } from '../../lib/engine';
import { costCalibration } from '../../lib/ai';
import { CashflowChart, CostBreakdownChart } from '../charts';
import { EvidenceLinks, SourceChip, Stat } from '../kit';
import type { StepProps } from './wizardModel';
import { SubTitle } from './ParamField';


export function CostPanel(props: StepProps) {
  const { draft, ev, estate, actuals, setParam, actions } = props;
  const [mode, setMode] = useState<'capex' | 'opex'>('capex');
  const [decided, setDecided] = useState<'accepted' | 'rejected' | undefined>();
  const cal = useMemo(() => (ev ? costCalibration(draft, ev, actuals, estate.projects, estate.dataCenters) : null), [draft, ev, actuals, estate.projects, estate.dataCenters]);
  const est = ev?.estimate;
  const lines = mode === 'capex' ? est?.capex ?? [] : est?.opex ?? [];
  const benchmarkValue = cal?.adjustment ?? cal?.capexPerKwBenchmark;
  const applyBenchmark = () => { if (!benchmarkValue) return; setParam('capexPerKw', benchmarkValue, 'benchmark'); actions.recordFeedback('cost-estimator', draft.id, true, `capexPerKw ${benchmarkValue}`); setDecided('accepted'); };
  const applyActual = () => { if (!cal?.capexPerKwActual) return; setParam('capexPerKw', cal.capexPerKwActual, 'actual'); actions.recordFeedback('cost-estimator', draft.id, true, `capexPerKw actual ${cal.capexPerKwActual}`); setDecided('accepted'); };

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
          <SubTitle><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><RobotOutlined /> Cost calibration</span></SubTitle>
          {cal && decided !== 'rejected' && (
            <AIInsightCard title={cal.adjustment ? `Move CapEx to ${fmtUsd(cal.adjustment)}/kW` : 'Estimate holds against the benchmark'} confidence={cal.confidence}
              body={<span>{cal.verdict} <EvidenceLinks items={cal.evidence} /></span>}
              actionLabel={decided === 'accepted' ? 'Applied' : benchmarkValue ? `Apply benchmark ${fmtUsd(benchmarkValue)}/kW` : undefined} onAction={decided === 'accepted' || !benchmarkValue ? undefined : applyBenchmark}
              sourceLabel={decided === 'accepted' ? undefined : 'Keep my estimate'} onSource={decided === 'accepted' ? undefined : () => { actions.recordFeedback('cost-estimator', draft.id, false); setDecided('rejected'); }} />
          )}
          {cal && decided === 'rejected' && <VwCard variant="child-shaded"><div className="vw-card-description">Calibration dismissed for this plan; the estimate stands on the entered rate.</div></VwCard>}
          {cal && (
            <VwCard variant="child" style={{ marginTop: 8 }} title="Comparables">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>This plan</span><strong>{fmtUsd(cal.capexPerKwPlan)}/kW</strong></div>
                {cal.capexPerKwBenchmark !== undefined && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Benchmark midpoint <SourceChip source="benchmark" /></span><strong>{fmtUsd(cal.capexPerKwBenchmark)}/kW</strong></div>}
                {cal.capexPerKwActual !== undefined && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Delivered programmes of this type <SourceChip source="actual" /></span><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><strong>{fmtUsd(cal.capexPerKwActual)}/kW</strong><button type="button" className="nst-btn nst-btn--xs" onClick={applyActual}>Use</button></span></div>}
                {cal.comparables.map(c => <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--vw-color-slate-600)' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{c.name}</span><span>{fmtUsd(c.capexPerKw)}/kW</span></div>)}
                {cal.comparables.length === 0 && <div style={{ color: 'var(--vw-color-slate-500)' }}>No delivered project of this site type with a budget to compare with.</div>}
              </div>
            </VwCard>
          )}
          {est?.benchmarkBand && <div style={{ marginTop: 8, fontSize: 12 }}><VwChip variant={est.capexPerKw < est.benchmarkBand.low * 0.85 ? 'warning' : est.capexPerKw > est.benchmarkBand.high * 1.1 ? 'warning' : 'success'}>{est.capexPerKw < est.benchmarkBand.low * 0.85 ? 'Below band' : est.capexPerKw > est.benchmarkBand.high * 1.1 ? 'Above band' : 'Inside band'}</VwChip></div>}
        </div>
      </div>
    </div>
  );
}
