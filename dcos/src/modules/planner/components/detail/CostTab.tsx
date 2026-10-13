/* Cost tab: CapEx and OpEx with every line's basis and source, the yearly cash flow with NPV, IRR and payback, depreciation, benefits, the bill-of-materials reconciliation and the benchmark band. */
import { useMemo } from 'react';
import { AlertTriangle, Briefcase, ChartLine, ChartPie, Gift, Receipt, Ruler, Scale } from 'lucide-react';
import { Chip, Panel } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import { CashflowChart, CostBreakdownChart } from '../charts';
import { WHOLE_SITE_SCOPES, fmtUsd, fmtKw, type CashflowYear, type EstimateLine } from '../../lib/engine';
import { SourceChip } from '../kit';
import { KvList, Muted, SourcedValue, ToneValue, n0, type PlanView } from './shared';

export function CostTab({ v }: { v: PlanView }) {
  const { ev, plan } = v;
  const est = ev.estimate;
  const band = est.benchmarkBand;
  type LineRow = EstimateLine & { id: string };
  const cols = (total: number): Col<LineRow>[] => [
    { key: 'item', header: 'Line', render: r => <span className="vw-card-activity-label">{r.item}</span> },
    { key: 'basis', header: 'Basis', wrap: true, render: r => <Muted size="xs">{r.basis}</Muted> },
    { key: 'source', header: 'Source', render: r => <SourceChip source={r.source} /> },
    { key: 'amount', header: 'Amount', align: 'right', render: r => <span className="num">{fmtUsd(r.amount)}</span> },
    { key: 'share', header: 'Share', align: 'right', render: r => <span className="num">{total ? Math.round((r.amount / total) * 100) : 0}%</span> },
  ];
  const withId = (lines: EstimateLine[] | undefined): LineRow[] => (lines ?? []).map(l => ({ ...l, id: l.item }));

  const bandPos = band && band.high > band.low ? Math.min(100, Math.max(0, ((est.capexPerKw - band.low) / (band.high - band.low)) * 100)) : undefined;
  const inBand = band ? est.capexPerKw >= band.low * 0.8 && est.capexPerKw <= band.high * 1.05 : undefined;
  const hasRevenue = est.revenueAnnual > 0;
  const hasBenefit = (est.benefitAnnual ?? 0) > 0;
  const recon = ev.reconciliation;
  const showRecon = WHOLE_SITE_SCOPES.includes(plan.scope) && recon;
  const flowCols: Col<CashflowYear & { id: string }>[] = [
    { key: 'y', header: 'Year', render: r => r.label },
    { key: 'c', header: 'CapEx', align: 'right', render: r => <span className="num">{fmtUsd(r.capex)}</span> },
    { key: 'r', header: 'Revenue', align: 'right', render: r => <span className="num">{fmtUsd(r.revenue)}</span> },
    { key: 'b', header: 'Benefits', align: 'right', render: r => <span className="num">{fmtUsd(r.benefit)}</span> },
    { key: 'o', header: 'OpEx', align: 'right', render: r => <span className="num">{fmtUsd(r.opex)}</span> },
    { key: 'd', header: 'Depreciation', align: 'right', render: r => <span className="num">{fmtUsd(r.depreciation ?? 0)}</span> },
    { key: 't', header: 'Tax', align: 'right', render: r => <span className="num">{fmtUsd(r.tax ?? 0)}</span> },
    { key: 'n', header: 'Net cash', align: 'right', render: r => <span className="num" style={{ color: r.net < 0 ? 'var(--vw-color-red-600)' : undefined }}>{fmtUsd(r.net)}</span> },
    { key: 'cu', header: 'Cumulative', align: 'right', render: r => <span className="num">{fmtUsd(r.cumulative)}</span> },
  ];
  const flowRows = useMemo(() => (est.cashflow ?? []).map(y => ({ ...y, id: y.label })), [est.cashflow]);


  return (
    <div className="col" style={{ gap: 16 }}>
      <StatGrid cols={4}>
        <StatTile label="CapEx total" value={fmtUsd(est.capexTotal)} sub={`${fmtUsd(est.capexPerRack)} per rack all-in`} />
        <StatTile label="MEP and fit-out per kW" value={<ToneValue tone={inBand === false ? 'warn' : undefined}>{fmtUsd(est.capexPerKw)}</ToneValue>} sub={band ? `band ${fmtUsd(band.low)} to ${fmtUsd(band.high)}` : 'no benchmark'} />
        <StatTile label="Contingency" value={fmtUsd(est.contingencyUsd ?? 0)} sub="its own line, on works" />
        <StatTile label="OpEx per month" value={fmtUsd(est.opexMonthly)} sub={`${fmtUsd(est.opexAnnual)} a year at steady state`} />
        <StatTile label="NPV" value={<ToneValue tone={est.npvUsd === undefined ? undefined : est.npvUsd >= 0 ? 'ok' : 'bad'}>{est.npvUsd === undefined ? '—' : fmtUsd(est.npvUsd)}</ToneValue>} sub={`at ${est.discountPct ?? '—'}% hurdle rate`} />
        <StatTile label="IRR" value={<ToneValue tone={est.irrPct == null ? 'warn' : est.irrPct >= (est.discountPct ?? 8) ? 'ok' : 'warn'}>{est.irrPct == null ? '—' : `${est.irrPct}%`}</ToneValue>} sub={est.irrPct == null ? 'cash flow never turns positive' : est.irrPct >= (est.discountPct ?? 8) ? 'above the hurdle' : 'below the hurdle'} />
        <StatTile label="Payback" value={<ToneValue tone={est.paybackMonths == null ? 'warn' : est.paybackMonths > 96 ? 'warn' : 'ok'}>{est.paybackMonths == null ? 'None' : `${est.paybackMonths} mo`}</ToneValue>} sub={est.paybackFacilityMonths !== undefined ? `facility only: ${est.paybackFacilityMonths === null ? 'none' : `${est.paybackFacilityMonths} mo`}` : hasRevenue || hasBenefit ? 'from the first spend' : 'no revenue or benefit'} />
        <StatTile label="Depreciation" value={fmtUsd(est.depreciationAnnual ?? 0)} sub="a year once every phase is live" />
      </StatGrid>

      {(est.notes ?? []).length > 0 && (
        <div className="note note--warn"><AlertTriangle size={16} /><div><b>Read with the figures</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{est.notes!.map(n => <li key={n}>{n}</li>)}</ul></div></div>
      )}

      {(est.cashflow ?? []).length > 0 && (
        <Panel icon={ChartLine} title="Cash flow by year" sub={est.paybackBasis}>
          <CashflowChart years={est.cashflow!} height={260} />
          <div style={{ marginTop: 12 }}><DataTable rows={flowRows} cols={flowCols} pageSize={200} compact /></div>
        </Panel>
      )}

      <div className="grid g-2">
        <Panel icon={ChartPie} title="CapEx breakdown" actions={<Chip tone="neutral">{fmtUsd(est.capexTotal)}</Chip>}>
          <CostBreakdownChart estimate={est} mode="capex" height={260} />
          <div style={{ marginTop: 12 }}><DataTable rows={withId(est.capex)} cols={cols(est.capexTotal)} pageSize={200} compact /></div>
        </Panel>
        <Panel icon={Receipt} title="OpEx breakdown (monthly, steady state)" actions={<Chip tone="neutral">{fmtUsd(est.opexMonthly)}</Chip>}>
          <CostBreakdownChart estimate={est} mode="opex" height={260} />
          <div style={{ marginTop: 12 }}><DataTable rows={withId(est.opex)} cols={cols(est.opexMonthly)} pageSize={200} compact /></div>
        </Panel>
      </div>

      {(est.benefitLines ?? []).length > 0 && (
        <Panel flush icon={Gift} title="Benefits a year" actions={<Chip tone="success">{fmtUsd(est.benefitAnnual ?? 0)}</Chip>}>
          <DataTable rows={withId(est.benefitLines)} cols={cols(est.benefitAnnual ?? 0)} pageSize={200} />
        </Panel>
      )}

      {showRecon && (
        <Panel flush icon={Scale} title="Bill of materials against the estimate" actions={<Chip tone={Math.abs(recon.gapPct) <= 15 ? 'success' : 'warning'}>{recon.gapPct > 0 ? '+' : ''}{recon.gapPct}%</Chip>}
          foot={<Muted size="xs">A gap above 15% raises a warning (R-FIN-04): explain it or align the bill and the estimate before approval.</Muted>}>
          <div className="dt"><div className="dt-scroll"><table className="nst-table dt-table">
            <thead><tr><th>Estimate line</th><th className="is-right num">Estimate</th><th className="is-right num">Bill of materials</th><th>Bill categories</th></tr></thead>
            <tbody>{recon.rows.map(r => <tr key={r.item}><td>{r.item}</td><td className="is-right num">{fmtUsd(r.estimate)}</td><td className="is-right num">{r.categories.length ? fmtUsd(r.bom) : <Muted size="xs">not in the bill</Muted>}</td><td><Muted size="xs">{r.categories.join(', ') || '—'}</Muted></td></tr>)}</tbody>
            <tfoot>
              <tr><td>Bill of materials</td><td /><td className="is-right num">{fmtUsd(recon.bomTotal)}</td><td /></tr>
              <tr><td>+ lines the bill does not cost ({recon.uncosted.map(u => u.item.toLowerCase()).join(', ') || 'none'})</td><td /><td className="is-right num">{fmtUsd(recon.reconciledTotal - recon.bomTotal)}</td><td /></tr>
              <tr><td><b>Reconciled total against the estimate</b></td><td className="is-right num" style={{ fontWeight: 600 }}>{fmtUsd(recon.estimateTotal)}</td><td className="is-right num" style={{ fontWeight: 600 }}>{fmtUsd(recon.reconciledTotal)}</td><td>{recon.gapUsd > 0 ? '+' : ''}{fmtUsd(recon.gapUsd)}</td></tr>
            </tfoot>
          </table></div></div>
        </Panel>
      )}

      <div className="grid g-2">
        <Panel icon={Ruler} title="Benchmark band" actions={band ? <Chip tone={inBand ? 'success' : 'warning'} dot>{inBand ? 'Inside band' : 'Outside band'}</Chip> : <Chip tone="neutral">No benchmark</Chip>}>
          {band ? (
            <div>
              <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'var(--vw-color-slate-100)', margin: '12px 0 6px' }}>
                <div style={{ position: 'absolute', left: '10%', right: '10%', top: 0, bottom: 0, borderRadius: 5, background: 'var(--vw-color-green-200)' }} />
                {bandPos !== undefined && <div style={{ position: 'absolute', top: -3, width: 16, height: 16, borderRadius: 8, background: inBand ? 'var(--vw-color-green-600)' : 'var(--vw-color-amber-500)', border: '2px solid var(--vw-color-surface-elevated)', left: `calc(10% + ${bandPos * 0.8}% - 8px)` }} title={`${fmtUsd(est.capexPerKw)}/kW`} />}
              </div>
              <div className="vw-flex vw-justify-between"><Muted size="xs">{fmtUsd(band.low)}/kW</Muted><Muted size="xs">plan {fmtUsd(est.capexPerKw)}/kW</Muted><Muted size="xs">{fmtUsd(band.high)}/kW</Muted></div>
              <div style={{ marginTop: 8 }}><Muted>{band.source}. The band covers MEP and fit-out only; land, shell, IT and contingency are separate lines.{est.actualsCapexPerKw ? ` Delivered programmes of this type ${fmtUsd(est.actualsCapexPerKw)}/kW.` : ''}</Muted></div>
            </div>
          ) : <Muted>No CapEx benchmark for this plan type; the estimate is built bottom-up.</Muted>}
          <div style={{ marginTop: 16 }}>
            <KvList items={[
              { label: 'CapEx per kW (MEP and fit-out)', value: <SourcedValue s={ev.params['capexPerKw']} unit="USD/kW" /> },
              { label: 'Shell and core', value: <SourcedValue s={ev.params['shellCostPerM2']} unit="USD/m²" /> },
              { label: 'Land', value: <SourcedValue s={ev.params['landCostUsd']} unit="USD" /> },
              { label: 'Cost contingency', value: <SourcedValue s={ev.params['costContingencyPct']} unit="%" /> },
              { label: 'Tariff', value: <SourcedValue s={ev.params['tariffUsdPerKwh']} unit="USD/kWh" /> },
              { label: 'Plant maintenance', value: <SourcedValue s={ev.params['maintenancePctCapex']} unit="% of MEP" /> },
            ]} />
          </div>
        </Panel>
        <div className="col" style={{ gap: 16 }}>
          <Panel icon={Briefcase} title="Business case inputs">
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
          </Panel>
        </div>
      </div>
    </div>
  );
}
