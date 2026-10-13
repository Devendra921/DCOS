/* Cost tab: CapEx and OpEx with every line's basis and source, the yearly cash flow with NPV, IRR and payback, depreciation, benefits, the bill-of-materials reconciliation and the benchmark band. */
import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { AIInsightCard, VwCard, VwChip } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { CashflowChart, CostBreakdownChart } from '../charts';
import { WHOLE_SITE_SCOPES, fmtUsd, fmtKw, type CashflowYear, type EstimateLine } from '../../lib/engine';
import { costCalibration } from '../../lib/ai';
import { EvidenceLinks, SourceChip, Stat } from '../kit';
import { KvList, Muted, SourcedValue, n0, type PlanView } from './shared';

export function CostTab({ v }: { v: PlanView }) {
  const { ev, plan, actuals, estate } = v;
  const est = ev.estimate;
  const band = est.benchmarkBand;
  const cal = useMemo(() => costCalibration(plan, ev, actuals, estate.projects, estate.dataCenters), [plan, ev, actuals, estate.projects, estate.dataCenters]);
  const cols = (total: number): ColumnsType<EstimateLine> => [
    { title: 'Line', dataIndex: 'item', key: 'item', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Basis', dataIndex: 'basis', key: 'basis', render: (b: string) => <span style={{ whiteSpace: 'normal' }}><Muted size="xs">{b}</Muted></span> },
    { title: 'Source', dataIndex: 'source', key: 'source', render: (s: EstimateLine['source']) => <SourceChip source={s} /> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: (a: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(a)}</span> },
    { title: 'Share', key: 'share', align: 'right', render: (_: unknown, r) => `${total ? Math.round((r.amount / total) * 100) : 0}%` },
  ];
  const bandPos = band && band.high > band.low ? Math.min(100, Math.max(0, ((est.capexPerKw - band.low) / (band.high - band.low)) * 100)) : undefined;
  const inBand = band ? est.capexPerKw >= band.low * 0.8 && est.capexPerKw <= band.high * 1.05 : undefined;
  const hasRevenue = est.revenueAnnual > 0;
  const hasBenefit = (est.benefitAnnual ?? 0) > 0;
  const recon = ev.reconciliation;
  const showRecon = WHOLE_SITE_SCOPES.includes(plan.scope) && recon;
  const flowCols: ColumnsType<CashflowYear> = [
    { title: 'Year', dataIndex: 'label', key: 'y' },
    { title: 'CapEx', dataIndex: 'capex', key: 'c', align: 'right', render: (x: number) => fmtUsd(x) },
    { title: 'Revenue', dataIndex: 'revenue', key: 'r', align: 'right', render: (x: number) => fmtUsd(x) },
    { title: 'Benefits', dataIndex: 'benefit', key: 'b', align: 'right', render: (x: number) => fmtUsd(x) },
    { title: 'OpEx', dataIndex: 'opex', key: 'o', align: 'right', render: (x: number) => fmtUsd(x) },
    { title: 'Depreciation', dataIndex: 'depreciation', key: 'd', align: 'right', render: (x?: number) => fmtUsd(x ?? 0) },
    { title: 'Tax', dataIndex: 'tax', key: 't', align: 'right', render: (x?: number) => fmtUsd(x ?? 0) },
    { title: 'Net cash', dataIndex: 'net', key: 'n', align: 'right', render: (x: number) => <span style={{ color: x < 0 ? 'var(--vw-color-red-600)' : undefined }}>{fmtUsd(x)}</span> },
    { title: 'Cumulative', dataIndex: 'cumulative', key: 'cu', align: 'right', render: (x: number) => fmtUsd(x) },
  ];

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Stat label="CapEx total" value={fmtUsd(est.capexTotal)} sub={`${fmtUsd(est.capexPerRack)} per rack all-in`} />
        <Stat label="MEP and fit-out per kW" value={fmtUsd(est.capexPerKw)} sub={band ? `band ${fmtUsd(band.low)} to ${fmtUsd(band.high)}` : 'no benchmark'} tone={inBand === false ? 'warn' : undefined} />
        <Stat label="Contingency" value={fmtUsd(est.contingencyUsd ?? 0)} sub="its own line, on works" />
        <Stat label="OpEx per month" value={fmtUsd(est.opexMonthly)} sub={`${fmtUsd(est.opexAnnual)} a year at steady state`} />
        <Stat label="NPV" value={est.npvUsd === undefined ? '—' : fmtUsd(est.npvUsd)} sub={`at ${est.discountPct ?? '—'}% hurdle rate`} tone={est.npvUsd === undefined ? undefined : est.npvUsd >= 0 ? 'ok' : 'bad'} />
        <Stat label="IRR" value={est.irrPct == null ? '—' : `${est.irrPct}%`} sub={est.irrPct == null ? 'cash flow never turns positive' : est.irrPct >= (est.discountPct ?? 8) ? 'above the hurdle' : 'below the hurdle'} tone={est.irrPct == null ? 'warn' : est.irrPct >= (est.discountPct ?? 8) ? 'ok' : 'warn'} />
        <Stat label="Payback" value={est.paybackMonths == null ? 'None' : `${est.paybackMonths} mo`} sub={est.paybackFacilityMonths !== undefined ? `facility only: ${est.paybackFacilityMonths === null ? 'none' : `${est.paybackFacilityMonths} mo`}` : hasRevenue || hasBenefit ? 'from the first spend' : 'no revenue or benefit'} tone={est.paybackMonths == null ? 'warn' : est.paybackMonths > 96 ? 'warn' : 'ok'} />
        <Stat label="Depreciation" value={fmtUsd(est.depreciationAnnual ?? 0)} sub="a year once every phase is live" />
      </div>

      {(est.notes ?? []).length > 0 && (
        <VwCard tone="warning" title="Read with the figures">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--vw-font-label-sm)' }}>{est.notes!.map(n => <li key={n}>{n}</li>)}</ul>
        </VwCard>
      )}

      {(est.cashflow ?? []).length > 0 && (
        <VwCard title="Cash flow by year" extra={<Muted>{est.paybackBasis}</Muted>}>
          <CashflowChart years={est.cashflow!} height={260} />
          <Table<CashflowYear> size="small" rowKey="label" dataSource={est.cashflow} columns={flowCols} pagination={false} scroll={{ x: 900 }} style={{ marginTop: 8 }} />
        </VwCard>
      )}

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <VwCard title="CapEx breakdown" extra={<VwChip variant="neutral">{fmtUsd(est.capexTotal)}</VwChip>}>
          <CostBreakdownChart estimate={est} mode="capex" height={260} />
          <Table<EstimateLine> size="small" rowKey="item" dataSource={est.capex} columns={cols(est.capexTotal)} pagination={false} style={{ marginTop: 8 }} />
        </VwCard>
        <VwCard title="OpEx breakdown (monthly, steady state)" extra={<VwChip variant="neutral">{fmtUsd(est.opexMonthly)}</VwChip>}>
          <CostBreakdownChart estimate={est} mode="opex" height={260} />
          <Table<EstimateLine> size="small" rowKey="item" dataSource={est.opex} columns={cols(est.opexMonthly)} pagination={false} style={{ marginTop: 8 }} />
        </VwCard>
      </div>

      {(est.benefitLines ?? []).length > 0 && (
        <VwCard title="Benefits a year" extra={<VwChip variant="success">{fmtUsd(est.benefitAnnual ?? 0)}</VwChip>}>
          <Table<EstimateLine> size="small" rowKey="item" dataSource={est.benefitLines} columns={cols(est.benefitAnnual ?? 0)} pagination={false} />
        </VwCard>
      )}

      {showRecon && (
        <VwCard title="Bill of materials against the estimate" extra={<VwChip variant={Math.abs(recon.gapPct) <= 15 ? 'success' : 'warning'}>{recon.gapPct > 0 ? '+' : ''}{recon.gapPct}%</VwChip>}>
          <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
            <thead><tr><th>Estimate line</th><th style={{ textAlign: 'right' }}>Estimate</th><th style={{ textAlign: 'right' }}>Bill of materials</th><th>Bill categories</th></tr></thead>
            <tbody>{recon.rows.map(r => <tr key={r.item}><td>{r.item}</td><td style={{ textAlign: 'right' }}>{fmtUsd(r.estimate)}</td><td style={{ textAlign: 'right' }}>{r.categories.length ? fmtUsd(r.bom) : <Muted size="xs">not in the bill</Muted>}</td><td><Muted size="xs">{r.categories.join(', ') || '—'}</Muted></td></tr>)}</tbody>
            <tfoot>
              <tr><td>Bill of materials</td><td /><td style={{ textAlign: 'right' }}>{fmtUsd(recon.bomTotal)}</td><td /></tr>
              <tr><td>+ lines the bill does not cost ({recon.uncosted.map(u => u.item.toLowerCase()).join(', ') || 'none'})</td><td /><td style={{ textAlign: 'right' }}>{fmtUsd(recon.reconciledTotal - recon.bomTotal)}</td><td /></tr>
              <tr><td style={{ fontWeight: 600 }}>Reconciled total against the estimate</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtUsd(recon.estimateTotal)}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtUsd(recon.reconciledTotal)}</td><td>{recon.gapUsd > 0 ? '+' : ''}{fmtUsd(recon.gapUsd)}</td></tr>
            </tfoot>
          </table></div>
          <div style={{ marginTop: 6 }}><Muted size="xs">A gap above 15% raises a warning (R-FIN-04): explain it or align the bill and the estimate before approval.</Muted></div>
        </VwCard>
      )}

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <VwCard title="Benchmark band" extra={band ? <VwChip variant={inBand ? 'success' : 'warning'}>{inBand ? 'Inside band' : 'Outside band'}</VwChip> : <VwChip variant="neutral">No benchmark</VwChip>}>
          {band ? (
            <div>
              <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'var(--vw-color-slate-100)', margin: '12px 0 6px' }}>
                <div style={{ position: 'absolute', left: '10%', right: '10%', top: 0, bottom: 0, borderRadius: 5, background: 'var(--vw-color-green-200)' }} />
                {bandPos !== undefined && <div style={{ position: 'absolute', top: -3, width: 16, height: 16, borderRadius: 8, background: inBand ? 'var(--vw-color-green-600)' : 'var(--vw-color-amber-500)', border: '2px solid var(--vw-color-surface-elevated)', left: `calc(10% + ${bandPos * 0.8}% - 8px)` }} title={`${fmtUsd(est.capexPerKw)}/kW`} />}
              </div>
              <div className="vw-flex vw-justify-between"><Muted size="xs">{fmtUsd(band.low)}/kW</Muted><Muted size="xs">plan {fmtUsd(est.capexPerKw)}/kW</Muted><Muted size="xs">{fmtUsd(band.high)}/kW</Muted></div>
              <div style={{ marginTop: 8 }}><Muted>{band.source}. The band covers MEP and fit-out only; land, shell, IT and contingency are separate lines.{est.actualsCapexPerKw ? ` Delivered programmes of this type ${fmtUsd(est.actualsCapexPerKw)}/kW.` : ''}</Muted></div>
            </div>
          ) : <div className="vw-card-description">No CapEx benchmark for this plan type; the estimate is built bottom-up.</div>}
          <div style={{ marginTop: 10 }}>
            <KvList items={[
              { label: 'CapEx per kW (MEP and fit-out)', value: <SourcedValue s={ev.params['capexPerKw']} unit="USD/kW" /> },
              { label: 'Shell and core', value: <SourcedValue s={ev.params['shellCostPerM2']} unit="USD/m²" /> },
              { label: 'Land', value: <SourcedValue s={ev.params['landCostUsd']} unit="USD" /> },
              { label: 'Cost contingency', value: <SourcedValue s={ev.params['costContingencyPct']} unit="%" /> },
              { label: 'Tariff', value: <SourcedValue s={ev.params['tariffUsdPerKwh']} unit="USD/kWh" /> },
              { label: 'Plant maintenance', value: <SourcedValue s={ev.params['maintenancePctCapex']} unit="% of MEP" /> },
            ]} />
          </div>
        </VwCard>
        <div className="vw-flex vw-flex-col vw-gap-md">
          <AIInsightCard title="Cost calibration" confidence={cal.confidence} body={<span>{cal.verdict} <EvidenceLinks items={cal.evidence} /></span>} sourceLabel={cal.comparables.length ? `${cal.comparables.length} comparable project(s)` : undefined} />
          <VwCard title="Business case inputs">
            <KvList items={[
              { label: 'Revenue or chargeback', value: <SourcedValue s={ev.params['revenuePerKwMonth']} unit="USD/kW-month" /> },
              { label: 'Target fill and ramp', value: <span><SourcedValue s={ev.params['targetFillPct']} unit="%" /> over <SourcedValue s={ev.params['fillRampMonths']} unit="months" /></span> },
              { label: 'Anchor and pre-let', value: <span><SourcedValue s={ev.params['anchorKw']} unit="kW" /> · <SourcedValue s={ev.params['preLetPct']} unit="%" /></span> },
              { label: 'IT draw of sold capacity', value: <SourcedValue s={ev.params['itDrawPct']} unit="%" /> },
              { label: 'Hurdle rate and tax', value: <span><SourcedValue s={ev.params['hurdlePct']} unit="%" /> · <SourcedValue s={ev.params['taxRatePct']} unit="%" /></span> },
              { label: 'Operator owns the IT', value: <SourcedValue s={ev.params['operatorOwnedIt']} /> },
              { label: 'IT refresh', value: <SourcedValue s={ev.params['refreshYears']} unit="years" /> },
              { label: 'Revenue a year (steady state)', value: hasRevenue ? fmtUsd(est.revenueAnnual) : '—' },
              { label: 'Energy recovered from tenants', value: est.energyRecoveredAnnual ? fmtUsd(est.energyRecoveredAnnual) : plan.demand.tenancy === 'multi' ? '—' : 'single tenant: not recovered' },
              { label: 'Energy', value: `${n0(est.energyMwhYear)} MWh a year · ${fmtKw(ev.sizing.itKw)} IT × PUE ${ev.sizing.pue.value}` },
              { label: 'Carbon', value: `${n0(ev.sustainability.carbonTYear)} t CO₂ a year at ${ev.sustainability.renewableSharePct}% renewable` },
            ]} />
          </VwCard>
        </div>
      </div>
    </div>
  );
}
