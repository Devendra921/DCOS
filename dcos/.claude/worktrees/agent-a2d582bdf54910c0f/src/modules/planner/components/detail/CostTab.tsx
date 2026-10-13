/* Cost tab: CapEx and OpEx breakdowns, every line with its basis and source, benchmark band and calibration, business case. */
import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { AIInsightCard, VwCard, VwChip } from '../../../../shared/components/ux';
import { VwTable as Table } from '../../../../shared/components/vw/VwTable';
import { CostBreakdownChart } from '../charts';
import { fmtUsd, fmtKw, type EstimateLine } from '../../lib/engine';
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
    { title: 'Basis', dataIndex: 'basis', key: 'basis', render: (b: string) => <Muted size="xs">{b}</Muted> },
    { title: 'Source', dataIndex: 'source', key: 'source', render: (s: EstimateLine['source']) => <SourceChip source={s} /> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right', render: (a: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(a)}</span> },
    { title: 'Share', key: 'share', align: 'right', render: (_: unknown, r) => `${total ? Math.round((r.amount / total) * 100) : 0}%` },
  ];
  const bandPos = band && band.high > band.low ? Math.min(100, Math.max(0, ((est.capexPerKw - band.low) / (band.high - band.low)) * 100)) : undefined;
  const inBand = band ? est.capexPerKw >= band.low * 0.8 && est.capexPerKw <= band.high * 1.05 : undefined;
  const hasRevenue = est.revenueAnnual > 0;

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Stat label="CapEx total" value={fmtUsd(est.capexTotal)} sub={`${fmtUsd(est.capexPerRack)} per rack`} />
        <Stat label="Plant CapEx per kW" value={fmtUsd(est.capexPerKw)} sub={band ? `band ${fmtUsd(band.low)} to ${fmtUsd(band.high)}` : 'no benchmark'} tone={inBand === false ? 'warn' : undefined} />
        <Stat label="OpEx per month" value={fmtUsd(est.opexMonthly)} sub={`${fmtUsd(est.opexAnnual)} a year`} />
        <Stat label="Cost per kW-month" value={fmtUsd(est.costPerKwMonth)} sub={plan.revenuePerKwMonth ? `revenue $${plan.revenuePerKwMonth}` : 'no revenue set'} />
        <Stat label="Energy" value={`${n0(est.energyMwhYear)} MWh`} sub={`a year at PUE ${ev.sizing.pue.value}`} />
        {hasRevenue && <Stat label="Margin" value={fmtUsd(est.marginAnnual)} sub={`on ${fmtUsd(est.revenueAnnual)} revenue`} tone={est.marginAnnual > 0 ? 'ok' : 'bad'} />}
        {hasRevenue && <Stat label="Payback" value={est.paybackMonths === null ? 'None' : `${est.paybackMonths} mo`} sub={est.paybackMonths === null ? 'no positive margin' : est.paybackMonths > 96 ? 'beyond 8 years' : 'within 8 years'} tone={est.paybackMonths === null || est.paybackMonths > 96 ? 'warn' : 'ok'} />}
      </div>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <VwCard title="CapEx breakdown" extra={<VwChip variant="neutral">{fmtUsd(est.capexTotal)}</VwChip>}>
          <CostBreakdownChart estimate={est} mode="capex" height={260} />
          <Table<EstimateLine> size="small" rowKey="item" dataSource={est.capex} columns={cols(est.capexTotal)} pagination={false} style={{ marginTop: 8 }} />
        </VwCard>
        <VwCard title="OpEx breakdown (monthly)" extra={<VwChip variant="neutral">{fmtUsd(est.opexMonthly)}</VwChip>}>
          <CostBreakdownChart estimate={est} mode="opex" height={260} />
          <Table<EstimateLine> size="small" rowKey="item" dataSource={est.opex} columns={cols(est.opexMonthly)} pagination={false} style={{ marginTop: 8 }} />
        </VwCard>
      </div>

      <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <VwCard title="Benchmark band" extra={band ? <VwChip variant={inBand ? 'success' : 'warning'}>{inBand ? 'Inside band' : 'Outside band'}</VwChip> : <VwChip variant="neutral">No benchmark</VwChip>}>
          {band ? (
            <div>
              <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'var(--vw-color-slate-100)', margin: '12px 0 6px' }}>
                <div style={{ position: 'absolute', left: '10%', right: '10%', top: 0, bottom: 0, borderRadius: 5, background: 'var(--vw-color-green-200)' }} />
                {bandPos !== undefined && <div style={{ position: 'absolute', top: -3, width: 16, height: 16, borderRadius: 8, background: inBand ? 'var(--vw-color-green-600)' : 'var(--vw-color-amber-500)', border: '2px solid var(--vw-color-surface-elevated)', left: `calc(10% + ${bandPos * 0.8}% - 8px)` }} title={`${fmtUsd(est.capexPerKw)}/kW`} />}
              </div>
              <div className="vw-flex vw-justify-between"><Muted size="xs">{fmtUsd(band.low)}/kW</Muted><Muted size="xs">plan {fmtUsd(est.capexPerKw)}/kW</Muted><Muted size="xs">{fmtUsd(band.high)}/kW</Muted></div>
              <div style={{ marginTop: 8 }}><Muted>{band.source}{est.actualsCapexPerKw ? ` · delivered programmes of this type ${fmtUsd(est.actualsCapexPerKw)}/kW` : ''}</Muted></div>
            </div>
          ) : <div className="vw-card-description">No CapEx benchmark for site type {plan.dcTypeKey}; the estimate stands on the parameter below.</div>}
          <div style={{ marginTop: 10 }}>
            <KvList items={[
              { label: 'CapEx per kW parameter', value: <SourcedValue s={ev.params['capexPerKw']} unit="USD/kW" /> },
              { label: 'IT CapEx per rack', value: <SourcedValue s={ev.params['itCapexPerRack']} unit="USD" /> },
              { label: 'Tariff', value: <SourcedValue s={ev.params['tariffUsdPerKwh']} unit="USD/kWh" /> },
              { label: 'Plant maintenance', value: <SourcedValue s={ev.params['maintenancePctCapex']} unit="% of CapEx" /> },
              { label: 'Property cost', value: <SourcedValue s={ev.params['leaseUsdPerM2Year']} unit="USD/m²/year" /> },
            ]} />
          </div>
        </VwCard>
        <div className="vw-flex vw-flex-col vw-gap-md">
          <AIInsightCard title="Cost calibration" confidence={cal.confidence} body={<span>{cal.verdict} <EvidenceLinks items={cal.evidence} /></span>} sourceLabel={cal.comparables.length ? `${cal.comparables.length} comparable project(s)` : undefined} />
          {cal.comparables.length > 0 && (
            <VwCard title="Comparable projects">
              <KvList items={cal.comparables.map(c => ({ label: c.name, value: `${fmtUsd(c.capexPerKw)}/kW` }))} />
            </VwCard>
          )}
          <VwCard title="Business case">
            <KvList items={[
              { label: 'Revenue or chargeback', value: <SourcedValue s={ev.params['revenuePerKwMonth']} unit="USD/kW-month" /> },
              { label: 'Revenue a year (85% sold)', value: hasRevenue ? fmtUsd(est.revenueAnnual) : '—' },
              { label: 'OpEx a year', value: fmtUsd(est.opexAnnual) },
              { label: 'Margin a year', value: hasRevenue ? fmtUsd(est.marginAnnual) : '—' },
              { label: 'Payback', value: est.paybackMonths === null ? (hasRevenue ? 'No positive margin' : 'Set a revenue to compute') : `${est.paybackMonths} months` },
              { label: 'Energy', value: `${n0(est.energyMwhYear)} MWh a year · ${fmtKw(ev.sizing.itKw)} IT × PUE ${ev.sizing.pue.value}` },
              { label: 'Carbon', value: `${n0(ev.sustainability.carbonTYear)} t CO₂ a year at ${ev.sustainability.renewableSharePct}% renewable` },
            ]} />
          </VwCard>
        </div>
      </div>
    </div>
  );
}
