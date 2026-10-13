/* Cost step: CapEx and OpEx with every line's basis and source, the cash flow, and the estimate against the benchmark band. */
import { useState } from 'react';
import { Chip, Panel, Seg } from '../../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import { fmtUsd } from '../../lib/engine';
import { CashflowChart, CostBreakdownChart } from '../charts';
import { SourceChip } from '../kit';
import { ToneValue } from '../detail/shared';
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
        <div className="col" style={{ gap: 8, marginBottom: 12 }}>
          <StatGrid cols={4}>
            <StatTile label="CapEx" value={fmtUsd(est.capexTotal)} sub={<span>{fmtUsd(est.capexPerKw)}/kW MEP and fit-out <SourceChip source={est.capex[0]?.source ?? 'benchmark'} /></span>} />
            <StatTile label="Per rack" value={fmtUsd(est.capexPerRack)} sub={`all-in${est.it ? ' including IT' : ''}; contingency ${fmtUsd(est.contingencyUsd ?? 0)}`} />
            <StatTile label="OpEx / month" value={fmtUsd(est.opexMonthly)} sub={`${fmtUsd(est.opexAnnual)} a year at steady state`} />
            <StatTile label="Per kW-month" value={fmtUsd(est.costPerKwMonth)} sub={`${est.energyMwhYear.toLocaleString('en-US')} MWh a year`} />
          </StatGrid>
          <StatGrid cols={4}>
            <StatTile label="NPV" value={<ToneValue tone={est.npvUsd === undefined ? undefined : est.npvUsd >= 0 ? 'ok' : 'bad'}>{est.npvUsd === undefined ? '—' : fmtUsd(est.npvUsd)}</ToneValue>} sub={`at the ${est.discountPct ?? '—'}% hurdle rate`} />
            <StatTile label="IRR" value={<ToneValue tone={est.irrPct == null ? 'warn' : est.irrPct >= (est.discountPct ?? 8) ? 'ok' : 'warn'}>{est.irrPct == null ? '—' : `${est.irrPct}%`}</ToneValue>} sub={est.irrPct == null ? 'never turns positive' : 'over the horizon'} />
            <StatTile label="Payback" value={<ToneValue tone={est.paybackMonths == null ? 'warn' : est.paybackMonths > 96 ? 'warn' : 'ok'}>{est.paybackMonths == null ? '—' : `${est.paybackMonths} mo`}</ToneValue>} sub={est.paybackFacilityMonths !== undefined ? `facility only ${est.paybackFacilityMonths === null ? 'none' : `${est.paybackFacilityMonths} mo`}` : est.paybackMonths == null ? 'no payback within the horizon' : 'from the first spend'} />
            <StatTile label="Revenue / year" value={fmtUsd(est.revenueAnnual)} sub={est.energyRecoveredAnnual ? `+ ${fmtUsd(est.energyRecoveredAnnual)} energy recovered` : 'at target fill, steady state'} />
          </StatGrid>
        </div>
      )}
      {(est?.notes ?? []).length > 0 && <div className="note note--info" style={{ marginBottom: 8, flexDirection: 'column', gap: 2 }}>{est!.notes!.map(n => <div key={n}>· {n}</div>)}</div>}
      {est?.cashflow && est.cashflow.length > 0 && (<>
        <SubTitle>Cash flow by year</SubTitle>
        <CashflowChart years={est.cashflow} height={200} />
        <div className="vw-label" style={{ fontSize: 12, marginBottom: 8 }}>{est.paybackBasis}</div>
      </>)}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <SubTitle extra={<Seg<'capex' | 'opex'> size="sm" value={mode} onChange={setMode} options={[{ id: 'capex', label: 'CapEx' }, { id: 'opex', label: 'OpEx' }]} />}>Breakdown</SubTitle>
          {est && <CostBreakdownChart estimate={est} mode={mode} height={220} />}
          <div className="dt" style={{ marginTop: 8 }}><div className="dt-scroll"><table className="nst-table dt-table">
            <thead><tr><th>Line</th><th className="is-right">{mode === 'capex' ? 'USD' : 'USD / month'}</th><th>Basis</th><th>Source</th></tr></thead>
            <tbody>{lines.map((l, i) => <tr key={i}><td><span className="strong">{l.item}</span></td><td className="is-right num">{l.amount.toLocaleString('en-US')}</td><td className="is-wrap"><span className="vw-label" style={{ fontSize: 12 }}>{l.basis}</span></td><td><SourceChip source={l.source} /></td></tr>)}</tbody>
            <tfoot><tr><td style={{ fontWeight: 600 }}>Total</td><td className="is-right num" style={{ fontWeight: 600 }}>{(mode === 'capex' ? est?.capexTotal ?? 0 : est?.opexMonthly ?? 0).toLocaleString('en-US')}</td><td colSpan={2} className="is-wrap">{mode === 'capex' && est?.benchmarkBand && <span style={{ fontSize: 12 }}>Benchmark band {fmtUsd(est.benchmarkBand.low)} to {fmtUsd(est.benchmarkBand.high)} per kW · <SourceChip source="benchmark" note={est.benchmarkBand.source} /></span>}</td></tr></tfoot>
          </table></div></div>
        </div>
        <div style={{ minWidth: 0 }}>
          <SubTitle>Against the benchmark</SubTitle>
          {est?.benchmarkBand ? (
            <Panel>
              <div className="row between" style={{ padding: '4px 0' }}><span className="vw-label">This plan</span><strong className="num">{fmtUsd(est.capexPerKw)} per kW</strong></div>
              <div className="row between" style={{ padding: '4px 0' }}><span className="vw-label">Benchmark band <SourceChip source="benchmark" note={est.benchmarkBand.source} /></span><span className="num">{fmtUsd(est.benchmarkBand.low)} to {fmtUsd(est.benchmarkBand.high)} per kW</span></div>
            </Panel>
          ) : <div className="vw-label">This plan type is costed bottom-up from its bill of materials; there is no per-kW benchmark to compare with.</div>}
          {est?.benchmarkBand && <div style={{ marginTop: 8, fontSize: 12 }}><Chip tone={est.capexPerKw < est.benchmarkBand.low * 0.85 ? 'warning' : est.capexPerKw > est.benchmarkBand.high * 1.1 ? 'warning' : 'success'} dot>{est.capexPerKw < est.benchmarkBand.low * 0.85 ? 'Below band' : est.capexPerKw > est.benchmarkBand.high * 1.1 ? 'Above band' : 'Inside band'}</Chip></div>}
        </div>
      </div>
    </div>
  );
}
