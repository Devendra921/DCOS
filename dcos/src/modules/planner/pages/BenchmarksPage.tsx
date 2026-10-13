/** Benchmarks & rules — /planning/benchmarks (a tab of the Planner hub). The reference numbers the
    planner uses, organised by the question they answer, and the rules every plan is checked against.
    Engine keys stay underneath; the screen shows plain names. */
import { useMemo, useState } from 'react';
import { Tooltip } from 'antd';
import { CalendarClock, DollarSign, Droplets, Gauge, Inbox, Pencil, Plus, Receipt, Ruler, ShieldAlert, ShieldCheck, Truck } from 'lucide-react';
import { Btn, Chip, Empty, Panel, Seg } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { dcTypeName } from '../../../mock/data/dcTypes';
import type * as T from '../../../mock/data/types';
import { ASPECT_LABEL, SCOPE_LABEL } from '../lib/engine';
import { useBenchmarks, useEstate, useTemplates } from '../lib/usePlanner';
import { RangeBar } from '../components/hub/visuals';
import { BenchmarkDrawer } from '../components/library/BenchmarkDrawer';
import { SourceCell, RuleKind } from '../components/library/parts';
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
    <div className="col" style={{ gap: 16 }}>
      {!embedded && <div className="ops-page-head"><h2 className="vw-page-title">Benchmarks and rules</h2></div>}
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Seg<View> value={view} onChange={setView} options={[
          { id: 'costs', label: `Costs · ${counts.costs}` }, { id: 'efficiency', label: `Efficiency · ${counts.efficiency}` }, { id: 'leadtimes', label: `Lead times · ${counts.leadtimes}` },
          { id: 'sizing', label: `Sizing & staffing · ${counts.sizing}` }, { id: 'rules', label: `Rules · ${counts.rules}` },
        ]} />
        {view !== 'rules' && <Btn icon={Plus} onClick={() => setEditing('new')}>Add value</Btn>}
      </div>

      {view === 'costs' && <>
        <Panel flush icon={DollarSign} count={by.capex.length} title="What does it cost to build, per kW?" sub="Plant and fit-out cost for each kW of IT, by site type. The planner uses the typical value unless our own delivered builds say otherwise.">
          <ValueTable rows={by.capex} onEdit={edit} first={{ title: 'Site type', render: b => dcTypeName(b.appliesTo.dcTypeKey ?? '') || 'All site types' }} fmt={b => money(b.value)} unitNote="per kW" />
        </Panel>
        <Panel flush icon={Receipt} count={by.otherCost.length} title="Other cost inputs" sub="IT equipment, maintenance, staff and energy prices used in CapEx and OpEx.">
          <ValueTable rows={by.otherCost} onEdit={edit} first={{ title: 'Item', render: b => <ItemName b={b} detail={scopeOf(b)} /> }} fmt={b => withUnit(b.value, b.unit)} />
        </Panel>
      </>}

      {view === 'efficiency' && <>
        <Panel flush icon={Gauge} count={by.pue.length} title="What PUE can we expect?" sub="Typical PUE for each cooling choice in each climate. Lower is better. Click a value to change it.">
          <PueMatrix rows={by.pue} onEdit={setEditing} />
        </Panel>
        <Panel flush icon={Droplets} count={by.water.length} title="Water and carbon" sub="Used for the sustainability figures of a plan.">
          <ValueTable rows={by.water} onEdit={edit} first={{ title: 'Item', render: b => <ItemName b={b} detail={scopeOf(b)} /> }} fmt={b => withUnit(b.value, b.unit)} />
        </Panel>
      </>}

      {view === 'leadtimes' && <>
        <Panel icon={Truck} count={by.lead.length} title="How long does equipment take to arrive?" sub="Weeks from order to delivery. The planner orders at the high end plus contingency, and flags anything that cannot arrive in time.">
          <LeadBars rows={by.lead} onEdit={setEditing} />
        </Panel>
        <Panel flush icon={CalendarClock} count={by.duration.length} title="How long does a build take?" sub="From start to the first hall ready for service, from our delivery history.">
          <ValueTable rows={by.duration} onEdit={edit} first={{ title: 'Kind of build', render: b => SCOPE_LABEL[metricDetail(b.metric) as T.PlannerScope] ?? metricDetail(b.metric) }} fmt={b => withUnit(b.value, b.unit)} />
        </Panel>
      </>}

      {view === 'sizing' && (
        <Panel flush icon={Ruler} count={by.sizing.length} title="Sizing and staffing rules of thumb" sub="How much space, margin and staff a plan needs. Hover a name to see what it means.">
          <ValueTable rows={by.sizing} onEdit={edit} first={{ title: 'Item', render: b => <ItemName b={b} detail={scopeOf(b)} /> }} fmt={b => withUnit(b.value, b.unit)} />
        </Panel>
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
      <span className="cell-2" style={{ minWidth: 0, whiteSpace: 'normal' }}>
        <span className="vw-card-activity-label">{info?.name ?? b.label}</span>
        {detail && <small>{detail}</small>}
      </span>
    </Tooltip>
  );
}

/** One reference value per row: name, typical value, range, source, edit. */
function ValueTable({ rows, first, fmt, onEdit, unitNote }: { rows: T.PlannerBenchmark[]; first: { title: string; render: (b: T.PlannerBenchmark) => React.ReactNode }; fmt: (b: T.PlannerBenchmark) => string; onEdit: (b: T.PlannerBenchmark) => () => void; unitNote?: string }) {
  const max = Math.max(1, ...rows.map(b => b.high ?? b.value ?? 0));
  const cols: Col<T.PlannerBenchmark>[] = [
    { key: 'name', header: first.title, wrap: true, render: b => first.render(b) },
    { key: 'typical', header: 'Typical', align: 'right', sort: b => b.value ?? 0, render: b => <span className="num"><b>{fmt(b)}</b>{unitNote && <span className="vw-label"> {unitNote}</span>}</span> },
    { key: 'range', header: 'Range', render: b => <span className="row" style={{ gap: 8 }}><RangeBar low={b.low} value={b.value} high={b.high} max={max} width={110} unit={b.unit} /><span className="vw-label num" style={{ whiteSpace: 'nowrap' }}>{rangeText(b)}</span></span> },
    { key: 'source', header: 'Source', render: b => <SourceCell source={b.source} date={b.sourceDate} indicative={b.indicative} /> },
    { key: 'edit', header: '', render: b => <Btn variant="ghost" size="xs" icon={Pencil} title="Edit" onClick={e => { e.stopPropagation(); onEdit(b)(); }} /> },
  ];
  return <DataTable<T.PlannerBenchmark> rows={rows} cols={cols} pageSize={200} onRow={b => onEdit(b)()}
    empty={<Empty icon={Inbox} title="No values yet">Add a value to make the planner use it.</Empty>} />;
}

/** PUE by cooling (rows) and climate (columns). Empty cells mean no benchmark for that pair. */
function PueMatrix({ rows, onEdit }: { rows: T.PlannerBenchmark[]; onEdit: (b: T.PlannerBenchmark) => void }) {
  const cell = (c: T.PlannerCoolingType, cl: string) => rows.find(b => b.appliesTo.coolingType === c && b.appliesTo.climate === cl);
  const coolings = COOLING_ORDER.filter(c => rows.some(b => b.appliesTo.coolingType === c));
  const best = Math.min(...rows.map(b => b.value ?? 9));
  if (!coolings.length) return <Empty icon={Gauge} title="No PUE values">Add PUE values per cooling type and climate.</Empty>;
  return (
    <div className="dt"><div className="dt-scroll">
      <table className="nst-table dt-table">
        <thead><tr><th>Cooling</th>{CLIMATE_ORDER.map(cl => <th key={cl} style={{ textAlign: 'center' }}>{CLIMATE_LABEL[cl]}</th>)}</tr></thead>
        <tbody>
          {coolings.map(c => (
            <tr key={c}>
              <td><span className="vw-card-activity-label">{COOLING_LABEL[c]}</span></td>
              {CLIMATE_ORDER.map(cl => { const b = cell(c, cl); return (
                <td key={cl} style={{ textAlign: 'center', cursor: b ? 'pointer' : undefined }} onClick={b ? () => onEdit(b) : undefined}>
                  {b ? <Tooltip title={`${b.source} · range ${rangeText(b)}`}><span><b className="num" style={{ color: b.value === best ? 'var(--vw-color-green-600)' : undefined }}>{fmtVal(b.value)}</b> <span className="vw-label num">{rangeText(b)}</span></span></Tooltip> : <span className="vw-text-tertiary">—</span>}
                </td>
              ); })}
            </tr>
          ))}
        </tbody>
      </table>
    </div></div>
  );
}

/** Lead times as horizontal bars, longest first. */
function LeadBars({ rows, onEdit }: { rows: T.PlannerBenchmark[]; onEdit: (b: T.PlannerBenchmark) => void }) {
  if (!rows.length) return <Empty icon={Truck} title="No lead times">Add lead times per equipment class.</Empty>;
  const max = Math.max(1, ...rows.map(b => b.high ?? b.value ?? 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const pct = (w: number) => `${(w / max) * 100}%`;
  return (
    <div className="lead-bars" role="img" aria-label="Equipment lead times in weeks">
      <div className="lead-row lead-axis" aria-hidden="true">
        <span />
        <div className="lead-track">{ticks.map(f => <span key={f} style={{ left: `${f * 100}%` }}>{Math.round(max * f)} wk</span>)}</div>
        <span /><span />
      </div>
      {rows.map(b => {
        const lo = b.low ?? b.value ?? 0, hi = b.high ?? b.value ?? 0;
        return (
          <button key={b.id} type="button" className="lead-row" onClick={() => onEdit(b)} title={`${metricDetail(b.metric)}: ${lo} to ${hi} weeks, typical ${b.value ?? '—'} · ${b.source}`}>
            <span className="lead-name">{metricDetail(b.metric)}</span>
            <span className="lead-track">
              {ticks.map(f => <i key={f} className="lead-grid" style={{ left: `${f * 100}%` }} />)}
              <i className={`lead-fill${hi >= 40 ? ' is-long' : ''}`} style={{ left: pct(lo), width: `max(6px, calc(${pct(hi)} - ${pct(lo)}))` }} />
            </span>
            <span className="lead-val">{lo}–{hi} weeks</span>
            <span className="lead-kind">{b.indicative ? 'indicative' : 'confirmed'}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Rules in two groups: must pass (blocks submission) and should pass (warns). */
function RulesView({ rules }: { rules: { rule: T.PlannerRuleDef; sets: string[] }[] }) {
  type RuleRow = { id: string; rule: T.PlannerRuleDef; sets: string[] };
  const cols: Col<RuleRow>[] = [
    { key: 'check', header: 'What is checked', wrap: true, sort: r => RULE_PLAIN[r.rule.check] ?? r.rule.title, render: r => <span className="cell-2" style={{ whiteSpace: 'normal' }}><span className="vw-card-activity-label">{RULE_PLAIN[r.rule.check] ?? r.rule.title}</span><small>{r.rule.title}</small></span> },
    { key: 'area', header: 'Area', sort: r => ASPECT_LABEL[r.rule.aspect], render: r => ASPECT_LABEL[r.rule.aspect] },
    { key: 'standard', header: 'Standard', wrap: true, render: r => r.rule.standard ?? <span className="vw-label">Internal</span> },
    { key: 'limit', header: 'Limit', align: 'right', render: r => (r.rule.threshold !== undefined ? <span className="num">{fmtVal(r.rule.threshold)}</span> : <span className="vw-label">—</span>) },
    { key: 'sets', header: 'In rule sets', wrap: true, render: r => <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{r.sets.map(s => <Chip key={s} tone="neutral" size="xs">{s}</Chip>)}</span> },
  ];
  const group = (sev: 'hard' | 'soft'): RuleRow[] => rules.filter(r => r.rule.severity === sev).map(r => ({ id: r.rule.id, ...r }));
  return <>
    {(['hard', 'soft'] as const).map(sev => (
      <Panel key={sev} flush icon={sev === 'hard' ? ShieldAlert : ShieldCheck} count={group(sev).length} title={sev === 'hard' ? 'Must pass' : 'Should pass'} actions={<RuleKind severity={sev} />}
        sub={sev === 'hard' ? 'A plan cannot be submitted while any of these fails.' : 'A plan can be submitted, but the reviewer sees a warning with the reason.'}>
        <DataTable<RuleRow> rows={group(sev)} cols={cols} pageSize={200} empty={<Empty icon={Inbox} title="No rules">No rule set carries a rule of this kind.</Empty>} />
      </Panel>
    ))}
  </>;
}
