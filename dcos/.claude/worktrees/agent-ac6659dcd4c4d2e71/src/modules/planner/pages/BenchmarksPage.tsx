/** Benchmarks & rules — /planning/benchmarks (a tab of the Planner hub). The reference numbers the
    planner uses, organised by the question they answer, and the rules every plan is checked against.
    Engine keys stay underneath; the screen shows plain names. */
import { useMemo, useState } from 'react';
import { Tooltip } from 'antd';
import type { TableColumnType } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable } from '../../../shared/components/vw/VwTable';
import { VwCard, VwChip, VwSegmented, EmptyState } from '../../../shared/components/ux';
import { PlusOutlined, EditOutlined } from '../../../shared/icons';
import { dcTypeName } from '../../../mock/data/dcTypes';
import type * as T from '../../../mock/data/types';
import { useVwPalette } from '../../site360/lib/siteModel';
import { ASPECT_LABEL, SCOPE_LABEL } from '../lib/engine';
import { useBenchmarks, useEstate, useTemplates } from '../lib/usePlanner';
import { RangeBar } from '../components/hub/visuals';
import { BenchmarkDrawer } from '../components/library/BenchmarkDrawer';
import { SourceCell, SectionIntro, RuleKind } from '../components/library/parts';
import { CLIMATE_LABEL, CLIMATE_ORDER, COOLING_LABEL, COOLING_ORDER, METRIC_INFO, RULE_PLAIN, fmtVal, metricDetail, metricKey } from '../components/library/labels';

type View = 'costs' | 'efficiency' | 'leadtimes' | 'sizing' | 'rules';
const money = (n?: number) => (n === undefined ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
/** Value with its unit, money first when the unit is USD. */
const withUnit = (n: number | undefined, unit: string) => {
  if (n === undefined) return '—';
  if (/^USD\/?/i.test(unit)) { const rest = unit.replace(/^USD\/?/i, ''); return `${money(n)}${rest ? ` / ${rest}` : ''}`; }
  if (unit === '%') return `${fmtVal(n)}%`;
  if (unit === 'ratio' || unit === 'x') return fmtVal(n);
  return `${fmtVal(n)} ${unit}`;
};
const rangeText = (b: T.PlannerBenchmark) => (b.low !== undefined && b.high !== undefined ? `${fmtVal(b.low)} – ${fmtVal(b.high)}` : '');

export default function BenchmarksPage({ embedded = false }: { embedded?: boolean }) {
  const benchmarks = useBenchmarks(); const templates = useTemplates(); const estate = useEstate();
  const [view, setView] = useState<View>('costs');
  const [editing, setEditing] = useState<T.PlannerBenchmark | 'new' | null>(null);

  const by = useMemo(() => {
    const g = (k: string) => benchmarks.filter(b => metricKey(b.metric) === k);
    return {
      capex: g('capexPerKw').sort((a, b) => (a.value ?? 0) - (b.value ?? 0)),
      otherCost: [...g('itCapexPerRack'), ...g('maintenancePctCapex'), ...g('staffCostFte'), ...g('tariff')],
      pue: g('pue'), water: [...g('wue'), ...g('carbonKgPerKwh')],
      lead: g('leadWeeks').sort((a, b) => (b.high ?? b.value ?? 0) - (a.high ?? a.value ?? 0)), duration: g('durationWeeks'),
      sizing: ['staffPerMw', 'whiteSpaceM2PerRack', 'floorLoadingKgPerRack', 'liquidThresholdKw', 'generatorMargin', 'coolingMargin', 'racksPerLeafPair'].flatMap(g),
    };
  }, [benchmarks]);

  /** Every rule across the rule sets, once, with the rule sets that carry it. */
  const rules = useMemo(() => {
    const m = new Map<string, { rule: T.PlannerRuleDef; sets: string[] }>();
    for (const t of templates.filter(x => x.kind === 'ruleset')) for (const r of t.rules) { const e = m.get(r.id) ?? { rule: r, sets: [] }; e.sets.push(t.name); m.set(r.id, e); }
    return [...m.values()].sort((a, b) => a.rule.aspect.localeCompare(b.rule.aspect));
  }, [templates]);

  const regionName = (id?: string) => estate.regions.find(r => r.id === id)?.name ?? '';
  const scopeOf = (b: T.PlannerBenchmark) => [b.appliesTo.dcTypeKey && dcTypeName(b.appliesTo.dcTypeKey), b.appliesTo.tier, b.appliesTo.regionId && regionName(b.appliesTo.regionId), b.appliesTo.coolingType && COOLING_LABEL[b.appliesTo.coolingType], b.appliesTo.climate && CLIMATE_LABEL[b.appliesTo.climate]].filter(Boolean).join(' · ');
  const edit = (b: T.PlannerBenchmark) => () => setEditing(b);

  const counts: Record<View, number> = { costs: by.capex.length + by.otherCost.length, efficiency: by.pue.length + by.water.length, leadtimes: by.lead.length + by.duration.length, sizing: by.sizing.length, rules: rules.length };

  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      {!embedded && <div className="vw-card-section"><div className="vw-page-title" role="heading" aria-level={3}>Benchmarks and rules</div></div>}
      <div className="vw-flex vw-justify-between vw-items-center vw-wrap vw-gap-sm">
        <VwSegmented<View> value={view} onChange={setView} options={[
          { label: `Costs · ${counts.costs}`, value: 'costs' }, { label: `Efficiency · ${counts.efficiency}`, value: 'efficiency' }, { label: `Lead times · ${counts.leadtimes}`, value: 'leadtimes' },
          { label: `Sizing & staffing · ${counts.sizing}`, value: 'sizing' }, { label: `Rules · ${counts.rules}`, value: 'rules' },
        ]} />
        {view !== 'rules' && <Button icon={<PlusOutlined />} onClick={() => setEditing('new')}>Add value</Button>}
      </div>

      {view === 'costs' && <>
        <VwCard>
          <SectionIntro title="What does it cost to build, per kW?">Plant and fit-out cost for each kW of IT, by site type. The planner uses the typical value unless our own delivered builds say otherwise.</SectionIntro>
          <ValueTable rows={by.capex} onEdit={edit} first={{ title: 'Site type', render: b => dcTypeName(b.appliesTo.dcTypeKey ?? '') || 'All site types' }} fmt={b => money(b.value)} unitNote="per kW" />
        </VwCard>
        <VwCard>
          <SectionIntro title="Other cost inputs">IT equipment, maintenance, staff and energy prices used in CapEx and OpEx.</SectionIntro>
          <ValueTable rows={by.otherCost} onEdit={edit} first={{ title: 'Item', render: b => <ItemName b={b} detail={scopeOf(b)} /> }} fmt={b => withUnit(b.value, b.unit)} />
        </VwCard>
      </>}

      {view === 'efficiency' && <>
        <VwCard>
          <SectionIntro title="What PUE can we expect?">Typical PUE for each cooling choice in each climate. Lower is better. Click a value to change it.</SectionIntro>
          <PueMatrix rows={by.pue} onEdit={setEditing} />
        </VwCard>
        <VwCard>
          <SectionIntro title="Water and carbon">Used for the sustainability figures of a plan.</SectionIntro>
          <ValueTable rows={by.water} onEdit={edit} first={{ title: 'Item', render: b => <ItemName b={b} detail={scopeOf(b)} /> }} fmt={b => withUnit(b.value, b.unit)} />
        </VwCard>
      </>}

      {view === 'leadtimes' && <>
        <VwCard>
          <SectionIntro title="How long does equipment take to arrive?">Weeks from order to delivery. The planner orders at the high end plus contingency, and flags anything that cannot arrive in time.</SectionIntro>
          <LeadBars rows={by.lead} onEdit={setEditing} />
        </VwCard>
        <VwCard>
          <SectionIntro title="How long does a build take?">From start to the first hall ready for service, from our delivery history.</SectionIntro>
          <ValueTable rows={by.duration} onEdit={edit} first={{ title: 'Kind of build', render: b => SCOPE_LABEL[metricDetail(b.metric) as T.PlannerScope] ?? metricDetail(b.metric) }} fmt={b => withUnit(b.value, b.unit)} />
        </VwCard>
      </>}

      {view === 'sizing' && (
        <VwCard>
          <SectionIntro title="Sizing and staffing rules of thumb">How much space, margin and staff a plan needs. Hover a name to see what it means.</SectionIntro>
          <ValueTable rows={by.sizing} onEdit={edit} first={{ title: 'Item', render: b => <ItemName b={b} detail={scopeOf(b)} /> }} fmt={b => withUnit(b.value, b.unit)} />
        </VwCard>
      )}

      {view === 'rules' && <RulesView rules={rules} />}

      <BenchmarkDrawer target={editing} regions={estate.regions} onClose={() => setEditing(null)} />
    </div>
  );
}

function ItemName({ b, detail }: { b: T.PlannerBenchmark; detail?: string }) {
  const info = METRIC_INFO[metricKey(b.metric)];
  return (
    <Tooltip title={info?.use}>
      <div style={{ minWidth: 0, whiteSpace: 'normal' }}>
        <div style={{ fontWeight: 500 }}>{info?.name ?? b.label}</div>
        {detail && <div className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>{detail}</div>}
      </div>
    </Tooltip>
  );
}

/** One reference value per row: name, typical value, range, source, edit. */
function ValueTable({ rows, first, fmt, onEdit, unitNote }: { rows: T.PlannerBenchmark[]; first: { title: string; render: (b: T.PlannerBenchmark) => React.ReactNode }; fmt: (b: T.PlannerBenchmark) => string; onEdit: (b: T.PlannerBenchmark) => () => void; unitNote?: string }) {
  const max = Math.max(1, ...rows.map(b => b.high ?? b.value ?? 0));
  const cols: TableColumnType<T.PlannerBenchmark>[] = [
    { title: first.title, render: (_: unknown, b) => first.render(b) },
    { title: 'Typical', width: 150, align: 'right', render: (_: unknown, b) => <span><b>{fmt(b)}</b>{unitNote && <span className="vw-text-tertiary"> {unitNote}</span>}</span> },
    { title: 'Range', width: 240, render: (_: unknown, b) => <span className="vw-flex vw-items-center vw-gap-sm"><RangeBar low={b.low} value={b.value} high={b.high} max={max} width={110} unit={b.unit} /><span className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)', whiteSpace: 'nowrap' }}>{rangeText(b)}</span></span> },
    { title: 'Source', width: 280, render: (_: unknown, b) => <SourceCell source={b.source} date={b.sourceDate} indicative={b.indicative} /> },
    { title: '', width: 48, render: (_: unknown, b) => <Button type="text" size="small" icon={<EditOutlined />} aria-label="Edit" onClick={e => { e.stopPropagation(); onEdit(b)(); }} /> },
  ];
  if (!rows.length) return <EmptyState variant="no-data" title="No values yet" description="Add a value to make the planner use it." />;
  return <div style={{ marginTop: 12 }}><VwTable<T.PlannerBenchmark> size="small" rowKey="id" pagination={false} columns={cols} dataSource={rows} onRow={b => ({ onClick: onEdit(b), style: { cursor: 'pointer' } })} /></div>;
}

/** PUE by cooling (rows) and climate (columns). Empty cells mean no benchmark for that pair. */
function PueMatrix({ rows, onEdit }: { rows: T.PlannerBenchmark[]; onEdit: (b: T.PlannerBenchmark) => void }) {
  const cell = (c: T.PlannerCoolingType, cl: string) => rows.find(b => b.appliesTo.coolingType === c && b.appliesTo.climate === cl);
  const coolings = COOLING_ORDER.filter(c => rows.some(b => b.appliesTo.coolingType === c));
  const best = Math.min(...rows.map(b => b.value ?? 9));
  if (!coolings.length) return <EmptyState variant="no-data" title="No PUE values" description="Add PUE values per cooling type and climate." />;
  return (
    <div className="nst-table-wrap" style={{ marginTop: 12 }}>
      <table className="nst-table">
        <thead><tr><th>Cooling</th>{CLIMATE_ORDER.map(cl => <th key={cl} style={{ textAlign: 'center' }}>{CLIMATE_LABEL[cl]}</th>)}</tr></thead>
        <tbody>
          {coolings.map(c => (
            <tr key={c}>
              <td style={{ fontWeight: 500 }}>{COOLING_LABEL[c]}</td>
              {CLIMATE_ORDER.map(cl => { const b = cell(c, cl); return (
                <td key={cl} style={{ textAlign: 'center', cursor: b ? 'pointer' : undefined }} onClick={b ? () => onEdit(b) : undefined}>
                  {b ? <Tooltip title={`${b.source} · range ${rangeText(b)}`}><span><b style={{ color: b.value === best ? 'var(--vw-color-green-600)' : undefined }}>{fmtVal(b.value)}</b> <span className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>{rangeText(b)}</span></span></Tooltip> : <span className="vw-text-tertiary">—</span>}
                </td>
              ); })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lead times as horizontal bars, longest first. */
function LeadBars({ rows, onEdit }: { rows: T.PlannerBenchmark[]; onEdit: (b: T.PlannerBenchmark) => void }) {
  const pal = useVwPalette();
  if (!rows.length) return <EmptyState variant="no-data" title="No lead times" description="Add lead times per equipment class." />;
  const max = Math.max(1, ...rows.map(b => b.high ?? b.value ?? 0));
  const W = 900, LABEL = 210, RIGHT = 200, ROW = 30, track = W - LABEL - RIGHT;
  const x = (w: number) => LABEL + (w / max) * track;
  return (
    <svg viewBox={`0 0 ${W} ${rows.length * ROW + 26}`} width="100%" role="img" aria-label="Equipment lead times in weeks" style={{ display: 'block', marginTop: 12 }}>
      {[0, 0.25, 0.5, 0.75, 1].map(f => <g key={f}><line x1={x(max * f)} x2={x(max * f)} y1={16} y2={rows.length * ROW + 20} stroke={pal.grid} strokeDasharray="2 3" /><text x={x(max * f)} y={10} fontSize={10} textAnchor="middle" fill={pal.slate}>{Math.round(max * f)} wk</text></g>)}
      {rows.map((b, i) => {
        const y = 20 + i * ROW; const lo = b.low ?? b.value ?? 0, hi = b.high ?? b.value ?? 0;
        return (
          <g key={b.id} transform={`translate(0, ${y})`} style={{ cursor: 'pointer' }} onClick={() => onEdit(b)}>
            <rect x={0} y={0} width={W} height={ROW} fill="transparent" />
            <text x={LABEL - 10} y={ROW / 2 + 4} fontSize={12} textAnchor="end" fill={pal.ink}>{metricDetail(b.metric)}</text>
            <rect x={LABEL} y={ROW / 2 - 5} width={track} height={10} rx={5} fill={pal.grid} opacity={0.5} />
            <rect x={x(lo)} y={ROW / 2 - 5} width={Math.max(4, x(hi) - x(lo))} height={10} rx={5} fill={hi >= 40 ? pal.amber : pal.blue} />
            <text x={W - RIGHT + 12} y={ROW / 2 + 4} fontSize={12} fill={pal.ink} fontWeight={600}>{lo}–{hi} weeks</text>
            <text x={W - 4} y={ROW / 2 + 4} fontSize={10} textAnchor="end" fill={pal.slate}>{b.indicative ? 'indicative' : 'confirmed'}</text>
            <title>{`${metricDetail(b.metric)}: ${lo} to ${hi} weeks, typical ${b.value ?? '—'} · ${b.source}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

/** Rules in two groups: must pass (blocks submission) and should pass (warns). */
function RulesView({ rules }: { rules: { rule: T.PlannerRuleDef; sets: string[] }[] }) {
  const cols: TableColumnType<{ rule: T.PlannerRuleDef; sets: string[] }>[] = [
    { title: 'What is checked', render: (_: unknown, r) => <div style={{ whiteSpace: 'normal' }}><div style={{ fontWeight: 500 }}>{RULE_PLAIN[r.rule.check] ?? r.rule.title}</div><div className="vw-text-tertiary" style={{ fontSize: 'var(--vw-font-label-xs)' }}>{r.rule.title}</div></div> },
    { title: 'Area', width: 200, render: (_: unknown, r) => ASPECT_LABEL[r.rule.aspect] },
    { title: 'Standard', width: 220, render: (_: unknown, r) => <span style={{ whiteSpace: 'normal' }}>{r.rule.standard ?? <span className="vw-text-tertiary">Internal</span>}</span> },
    { title: 'Limit', width: 90, align: 'right', render: (_: unknown, r) => (r.rule.threshold !== undefined ? fmtVal(r.rule.threshold) : <span className="vw-text-tertiary">—</span>) },
    { title: 'In rule sets', width: 220, render: (_: unknown, r) => <span className="vw-flex vw-gap-xs vw-wrap" style={{ whiteSpace: 'normal' }}>{r.sets.map(s => <VwChip key={s} variant="neutral" style={{ fontSize: 10 }}>{s}</VwChip>)}</span> },
  ];
  const group = (sev: 'hard' | 'soft') => rules.filter(r => r.rule.severity === sev);
  return <>
    {(['hard', 'soft'] as const).map(sev => (
      <VwCard key={sev}>
        <SectionIntro title={sev === 'hard' ? `Must pass · ${group(sev).length}` : `Should pass · ${group(sev).length}`} extra={<RuleKind severity={sev} />}>
          {sev === 'hard' ? 'A plan cannot be submitted while any of these fails.' : 'A plan can be submitted, but the reviewer sees a warning with the reason.'}
        </SectionIntro>
        <div style={{ marginTop: 12 }}><VwTable size="small" rowKey={r => r.rule.id} pagination={false} columns={cols} dataSource={group(sev)} /></div>
      </VwCard>
    ))}
  </>;
}
