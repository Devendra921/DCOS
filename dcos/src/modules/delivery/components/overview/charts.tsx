/**
 * Delivery overview charts. Plain SVG measured to its container (text never scales), design
 * tokens only, one idea per chart, tooltips on every mark. Built on the planner's chart kit.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { scaleBand, scaleLinear } from 'd3-scale';
import { CheckCircle2 } from 'lucide-react';
import { Btn, Empty, Panel } from '../../../../ops/ui/kit';
import { StatTile } from '../../../../ops/ui/Analytics';
import { useVwPalette } from '../../../site360/lib/siteModel';
import { useMeasuredWidth, useTip } from '../../../planner/components/charts/chartKit';
import { ChartTip, TipRows } from '../../../planner/components/charts/ChartBits';
import type { ChangeWeek, DayLoad, FlowWeek, Matrix, ProgrammeBar } from './trends';
import { RAGS, STAGES } from './trends';
import type { AttentionRow } from '../home/model';

const AXIS = { fontSize: 11, fill: 'var(--vw-color-slate-500)' } as const;
const money = (n: number) => (Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);
const pctTxt = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`);

/* ------------------------------------------------------------------ KPI tile with sparkline */
export interface KpiTileProps { label: string; value: ReactNode; sub?: ReactNode; delta?: { text: string; tone: 'good' | 'bad' | 'neutral' }; spark?: (number | null)[]; sparkKind?: 'line' | 'bars'; to?: string; footer?: ReactNode }
export function KpiTile({ label, value, sub, delta, spark, sparkKind = 'line', to, footer }: KpiTileProps) {
  const body = (
    <StatTile label={<span title={label}>{label}</span>} value={value}
      sub={(delta || sub) ? <>{delta && <span style={{ fontWeight: 500, color: delta.tone === 'good' ? 'var(--vw-color-green-700)' : delta.tone === 'bad' ? 'var(--vw-color-red-600)' : undefined }}>{delta.text}</span>}{delta && sub && ' · '}{sub}</> : undefined}>
      {(spark && spark.some(v => v !== null)) || footer ? <>{spark && spark.some(v => v !== null) && <Sparkline values={spark} kind={sparkKind} width={110} height={34} />}{footer}</> : null}
    </StatTile>
  );
  return to ? <Link to={to} style={{ color: 'inherit', textDecoration: 'none', display: 'block', minWidth: 0 }}>{body}</Link> : body;
}

export function Sparkline({ values, kind = 'line', width = 92, height = 34 }: { values: (number | null)[]; kind?: 'line' | 'bars'; width?: number; height?: number }) {
  const p = useVwPalette();
  const nums = values.map(v => v ?? 0);
  const max = Math.max(1, ...nums), min = kind === 'bars' ? 0 : Math.min(...nums);
  const y = (v: number) => height - 3 - ((v - min) / Math.max(1e-9, max - min)) * (height - 8);
  const step = width / Math.max(1, values.length - (kind === 'bars' ? 0 : 1));
  if (kind === 'bars') {
    const bw = Math.max(2, step - 2);
    return <svg width={width} height={height} aria-hidden style={{ flex: 'none' }}>{nums.map((v, i) => <rect key={i} x={i * step + 1} y={y(v)} width={bw} height={height - 3 - y(v)} rx={1} fill={i === nums.length - 1 ? p.blue : p.blueLight} />)}</svg>;
  }
  const pts = values.map((v, i) => (v === null ? null : [i * step, y(v)] as const));
  const d = pts.reduce((acc, pt, i) => (pt ? `${acc}${acc && pts[i - 1] ? 'L' : 'M'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}` : acc), '');
  const last = [...pts].reverse().find(Boolean);
  const area = pts.every(Boolean) ? `${d}L${width},${height}L0,${height}Z` : undefined;
  return (
    <svg width={width} height={height} aria-hidden style={{ flex: 'none', overflow: 'visible' }}>
      {area && <path d={area} fill={p.blue} opacity={0.08} />}
      <path d={d} fill="none" stroke={p.blue} strokeWidth={1.6} strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={2.6} fill={p.blue} />}
    </svg>
  );
}

/* ------------------------------------------------------------------ chart frame */
export function ChartCard({ title, subtitle, extra, legend, children, footer }: { title: string; subtitle?: string; extra?: ReactNode; legend?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Panel title={title} sub={subtitle} actions={extra} foot={footer} style={{ height: '100%' }}>
      <div className="col" style={{ gap: 10, minWidth: 0 }}>{legend}<div style={{ minWidth: 0 }}>{children}</div></div>
    </Panel>
  );
}
export function LegendRow({ items }: { items: { label: string; color: string; kind?: 'bar' | 'line' | 'dash' | 'diamond' }[] }) {
  return (
    <div className="vw-flex vw-wrap" style={{ gap: '4px 16px', fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-600)' }}>
      {items.map(it => (
        <span key={it.label} className="vw-inline-flex vw-items-center" style={{ gap: 6 }}>
          {it.kind === 'line' ? <span style={{ width: 16, borderTop: `2px solid ${it.color}` }} /> : it.kind === 'dash' ? <span style={{ width: 16, borderTop: `2px dashed ${it.color}` }} /> : it.kind === 'diamond' ? <span style={{ width: 8, height: 8, background: it.color, transform: 'rotate(45deg)' }} /> : <span style={{ width: 10, height: 10, borderRadius: 2, background: it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

const M = { top: 10, right: 44, bottom: 26, left: 40 };
const niceMax = (v: number) => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(k => n <= k) ?? 10) * p; };

/* ------------------------------------------------------------------ work flow (bars + line) */
export function WorkFlowChart({ weeks, height = 230 }: { weeks: FlowWeek[]; height?: number }) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth(600);
  const { tip, show, hide } = useTip(wrapRef);
  const iw = Math.max(120, width - M.left - M.right), ih = height - M.top - M.bottom;
  const x = useMemo(() => scaleBand<number>().domain(weeks.map((_, i) => i)).range([0, iw]).paddingInner(0.35).paddingOuter(0.15), [weeks, iw]);
  const max = niceMax(Math.max(...weeks.map(w => Math.max(w.completed + w.failed, w.raised))));
  const y = scaleLinear().domain([0, max]).range([ih, 0]);
  const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${(x(i)! + x.bandwidth() / 2).toFixed(1)},${y(w.raised).toFixed(1)}`).join('');
  const every = Math.ceil(weeks.length / Math.max(1, Math.floor(iw / 64)));
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} onMouseLeave={hide}>
        <svg width={width} height={height} role="img" aria-label="Work orders raised and completed per week">
          <g transform={`translate(${M.left},${M.top})`}>
            {y.ticks(4).map(v => <g key={v}><line x1={0} x2={iw} y1={y(v)} y2={y(v)} stroke={p.grid} /><text x={-8} y={y(v)} dy="0.32em" textAnchor="end" {...AXIS}>{v}</text></g>)}
            {weeks.map((w, i) => (
              <g key={w.start} onMouseMove={e => show(e, <TipRows title={`Week of ${w.label}${i === weeks.length - 1 ? ' (so far)' : ''}`} rows={[['Completed', w.completed], ['Failed', w.failed], ['Raised', w.raised], ['Open at week end', w.backlog]]} />)}>
                <rect x={x(i)! - x.step() * 0.15} y={0} width={x.step()} height={ih} fill="transparent" />
                <rect x={x(i)} y={y(w.completed)} width={x.bandwidth()} height={ih - y(w.completed)} rx={2} fill={i === weeks.length - 1 ? p.blueLight : p.blue} />
                {w.failed > 0 && <rect x={x(i)} y={y(w.completed + w.failed)} width={x.bandwidth()} height={y(w.completed) - y(w.completed + w.failed)} rx={2} fill={p.red} />}
                {i % every === 0 && <text x={x(i)! + x.bandwidth() / 2} y={ih + 16} textAnchor="middle" {...AXIS}>{w.label}</text>}
              </g>
            ))}
            <path d={line} fill="none" stroke={p.slateDark} strokeWidth={1.6} strokeDasharray="4 3" pointerEvents="none" />
            {weeks.map((w, i) => <circle key={w.start} cx={x(i)! + x.bandwidth() / 2} cy={y(w.raised)} r={2.2} fill={p.slateDark} pointerEvents="none" />)}
          </g>
        </svg>
      <ChartTip tip={tip} width={width} />
    </div>
  );
}

/* ------------------------------------------------------------------ change outcomes (stacked + rate) */
export function ChangeOutcomeChart({ weeks, height = 230 }: { weeks: ChangeWeek[]; height?: number }) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth(600);
  const { tip, show, hide } = useTip(wrapRef);
  const iw = Math.max(120, width - M.left - M.right), ih = height - M.top - M.bottom;
  const x = useMemo(() => scaleBand<number>().domain(weeks.map((_, i) => i)).range([0, iw]).paddingInner(0.35).paddingOuter(0.15), [weeks, iw]);
  const max = niceMax(Math.max(...weeks.map(w => w.total)));
  const y = scaleLinear().domain([0, max]).range([ih, 0]);
  const yr = scaleLinear().domain([0, 100]).range([ih, 0]);
  const pts = weeks.map((w, i) => (w.successPct === null ? null : [x(i)! + x.bandwidth() / 2, yr(w.successPct)] as const));
  const line = pts.reduce((acc, pt, i) => (pt ? `${acc}${acc && pts[i - 1] ? 'L' : 'M'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}` : acc), '');
  const every = Math.ceil(weeks.length / Math.max(1, Math.floor(iw / 64)));
  const COL = { standard: p.emerald, normal: p.blue, emergency: p.amber };
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} onMouseLeave={hide}>
        <svg width={width} height={height} role="img" aria-label="Changes implemented per week by class, with the success rate">
          <g transform={`translate(${M.left},${M.top})`}>
            {y.ticks(4).map(v => <g key={v}><line x1={0} x2={iw} y1={y(v)} y2={y(v)} stroke={p.grid} /><text x={-8} y={y(v)} dy="0.32em" textAnchor="end" {...AXIS}>{v}</text></g>)}
            {[0, 50, 100].map(v => <text key={v} x={iw + 8} y={yr(v)} dy="0.32em" {...AXIS}>{v}%</text>)}
            {weeks.map((w, i) => {
              let acc = 0;
              const seg = (n: number, col: string, key: string) => { if (!n) return null; const y0 = y(acc), y1 = y(acc + n); acc += n; return <rect key={key} x={x(i)} y={y1} width={x.bandwidth()} height={y0 - y1} fill={col} />; };
              return (
                <g key={w.start} onMouseMove={e => show(e, <TipRows title={`Week of ${w.label}`} rows={[['Standard', w.standard], ['Normal', w.normal], ['Emergency', w.emergency], ['Failed or rolled back', w.failed], ['With issues', w.withIssues], ['Success rate', pctTxt(w.successPct)]]} />)}>
                  <rect x={x(i)! - x.step() * 0.15} y={0} width={x.step()} height={ih} fill="transparent" />
                  {seg(w.standard, COL.standard, 's')}{seg(w.normal, COL.normal, 'n')}{seg(w.emergency, COL.emergency, 'e')}
                  {w.failed > 0 && <circle cx={x(i)! + x.bandwidth() / 2} cy={y(w.total) - 7} r={3} fill={p.red} />}
                  {i % every === 0 && <text x={x(i)! + x.bandwidth() / 2} y={ih + 16} textAnchor="middle" {...AXIS}>{w.label}</text>}
                </g>
              );
            })}
            <path d={line} fill="none" stroke={p.slateDark} strokeWidth={1.6} pointerEvents="none" />
          </g>
        </svg>
      <ChartTip tip={tip} width={width} />
    </div>
  );
}

/* ------------------------------------------------------------------ cost S-curve */
export interface CurvePoint { month: string; pv: number; ev?: number; ac?: number }
export function CostCurveChart({ points, bac, eac, height = 240 }: { points: CurvePoint[]; bac: number; eac: number; height?: number }) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth(600);
  const { tip, show, hide } = useTip(wrapRef);
  const iw = Math.max(120, width - M.left - M.right), ih = height - M.top - M.bottom;
  const max = niceMax(Math.max(bac, eac, ...points.map(x => Math.max(x.pv, x.ev ?? 0, x.ac ?? 0))) * 1.05);
  const x = scaleLinear().domain([0, Math.max(1, points.length - 1)]).range([0, iw]);
  const y = scaleLinear().domain([0, max]).range([ih, 0]);
  const path = (k: 'pv' | 'ev' | 'ac') => points.reduce((acc, pt, i) => (pt[k] === undefined ? acc : `${acc}${acc ? 'L' : 'M'}${x(i).toFixed(1)},${y(pt[k]!).toFixed(1)}`), '');
  const nowIdx = points.reduce((last, pt, i) => (pt.ac !== undefined ? i : last), -1);
  const every = Math.ceil(points.length / Math.max(1, Math.floor(iw / 56)));
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} onMouseLeave={hide}>
        <svg width={width} height={height} role="img" aria-label="Planned value, earned value and actual cost over time">
          <g transform={`translate(${M.left + 6},${M.top})`}>
            {y.ticks(4).map(v => <g key={v}><line x1={0} x2={iw - 6} y1={y(v)} y2={y(v)} stroke={p.grid} /><text x={-8} y={y(v)} dy="0.32em" textAnchor="end" {...AXIS}>{money(v)}</text></g>)}
            <line x1={0} x2={iw - 6} y1={y(bac)} y2={y(bac)} stroke={p.slate} strokeDasharray="2 3" /><text x={iw - 4} y={y(bac)} dy="0.32em" {...AXIS}>Budget</text>
            {nowIdx >= 0 && <g><line x1={x(nowIdx)} x2={x(nowIdx)} y1={0} y2={ih} stroke={p.slateLight} /><text x={x(nowIdx)} y={-2} textAnchor="middle" {...AXIS}>Today</text></g>}
            <path d={path('pv')} fill="none" stroke={p.slate} strokeWidth={1.6} strokeDasharray="5 4" />
            <path d={path('ev')} fill="none" stroke={p.blue} strokeWidth={2} />
            <path d={path('ac')} fill="none" stroke={p.amber} strokeWidth={2} />
            {points.map((pt, i) => (
              <g key={pt.month} onMouseMove={e => show(e, <TipRows title={pt.month} rows={[['Planned value', money(pt.pv)], ['Earned value', pt.ev === undefined ? '—' : money(pt.ev)], ['Actual cost', pt.ac === undefined ? '—' : money(pt.ac)]]} />)}>
                <rect x={x(i) - iw / Math.max(1, points.length) / 2} y={0} width={iw / Math.max(1, points.length)} height={ih} fill="transparent" />
                {i % every === 0 && <text x={x(i)} y={ih + 16} textAnchor="middle" {...AXIS}>{pt.month}</text>}
              </g>
            ))}
          </g>
        </svg>
      <ChartTip tip={tip} width={width} />
    </div>
  );
}

/* ------------------------------------------------------------------ portfolio health matrix */
const RAG_FILL: Record<string, string> = { Green: 'var(--vw-color-green-500)', Amber: 'var(--vw-color-amber-500)', Red: 'var(--vw-color-red-500)', Grey: 'var(--vw-color-slate-400)' };
const RAG_LABEL: Record<string, string> = { Green: 'On track', Amber: 'Watch', Red: 'In trouble', Grey: 'Not started' };
export function HealthMatrix({ matrix, linkFor }: { matrix: Matrix; linkFor: (stage: string, rag: string) => string }) {
  const max = Math.max(1, ...STAGES.flatMap(s => RAGS.map(r => matrix[s][r].length)));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `110px repeat(${STAGES.length}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${RAGS.length}, minmax(38px, 1fr))`, flex: 1, gap: 4, fontSize: 'var(--vw-font-label-sm)' }}>
      <span />
      {STAGES.map(s => <span key={s} style={{ textAlign: 'center', color: 'var(--vw-color-slate-500)', fontSize: 'var(--vw-font-label-xs)', padding: '2px 0' }}>{s}</span>)}
      {RAGS.map(r => (
        <div key={r} style={{ display: 'contents' }}>
          <span className="vw-inline-flex vw-items-center" style={{ gap: 6, color: 'var(--vw-color-slate-700)' }}><span style={{ width: 8, height: 8, borderRadius: 4, background: RAG_FILL[r] }} />{RAG_LABEL[r]}</span>
          {STAGES.map(s => {
            const n = matrix[s][r].length;
            const cell = (
              <div title={n ? matrix[s][r].map(x => x.project.name).join('\n') : undefined} style={{ height: '100%', minHeight: 38, borderRadius: 6, display: 'grid', placeItems: 'center', fontWeight: n ? 600 : 400, fontVariantNumeric: 'tabular-nums',
                background: n ? `color-mix(in srgb, ${RAG_FILL[r]} ${18 + Math.round((n / max) * 50)}%, white)` : 'var(--vw-color-slate-50)', color: n ? 'var(--vw-color-slate-900)' : 'var(--vw-color-slate-300)', border: '1px solid var(--vw-color-slate-100)' }}>{n || '·'}</div>
            );
            return n ? <Link key={s} to={linkFor(s, r)} style={{ textDecoration: 'none', display: 'block' }} aria-label={`${n} ${RAG_LABEL[r].toLowerCase()} projects in ${s}`}>{cell}</Link> : <div key={s} style={{ display: 'block' }}>{cell}</div>;
          })}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ programme progress */
const STATUS_TXT: Record<ProgrammeBar['status'], { label: string; color: string }> = {
  ahead: { label: 'Ahead', color: 'var(--vw-color-green-700)' }, 'on track': { label: 'On track', color: 'var(--vw-color-green-700)' }, behind: { label: 'Behind', color: 'var(--vw-color-red-600)' },
  'not started': { label: 'Not started', color: 'var(--vw-color-slate-500)' }, done: { label: 'Delivered', color: 'var(--vw-color-slate-600)' },
};
export function ProgrammeProgress({ bars, limit = 6 }: { bars: ProgrammeBar[]; limit?: number }) {
  const p = useVwPalette();
  const [all, setAll] = useState(false);
  const cols = 'minmax(0, 1.25fr) minmax(110px, 1.5fr) 64px 76px';
  const shown = all ? bars : bars.slice(0, limit);
  return (
    <div className="col" style={{ gap: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)', padding: '0 0 6px' }}>
        <span>Programme</span><span>Work done · line = time elapsed</span><span style={{ textAlign: 'right' }}>Spent</span><span>Schedule</span>
      </div>
      {shown.map(b => (
        <Link key={b.row.program.id} to={`/delivery/programs/${b.row.program.id}`} style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--vw-color-slate-100)', color: 'inherit', textDecoration: 'none' }}>
          <span style={{ minWidth: 0 }}>
            <span className="vw-flex vw-items-center" style={{ gap: 6, fontSize: 'var(--vw-font-label-sm)', fontWeight: 500, color: 'var(--vw-color-slate-900)', minWidth: 0 }} title={`${b.row.program.name} · health ${RAG_LABEL[b.rag].toLowerCase()}`}>
              <span style={{ width: 8, height: 8, borderRadius: 4, flex: 'none', background: RAG_FILL[b.rag] }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.row.program.name}</span>
            </span>
            <span style={{ display: 'block', fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)', marginLeft: 14 }}>{b.row.projects.length} project{b.row.projects.length === 1 ? '' : 's'} · {money(b.budget)}</span>
          </span>
          <span className="vw-flex vw-items-center" style={{ gap: 8 }} title={`${Math.round(b.completion)}% done, ${Math.round(b.elapsed)}% of the time used`}>
            <span style={{ position: 'relative', height: 16, flex: 1 }}>
              <span style={{ position: 'absolute', inset: '3px 0', borderRadius: 5, background: 'var(--vw-color-slate-100)' }} />
              <span style={{ position: 'absolute', top: 3, bottom: 3, left: 0, width: `${Math.min(100, b.completion)}%`, borderRadius: 5, background: b.status === 'behind' ? p.amber : p.blue }} />
              <span style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${b.elapsed}% - 1px)`, width: 2, background: 'var(--vw-color-slate-800)', borderRadius: 1 }} />
            </span>
            <span className="num" style={{ width: 34, textAlign: 'right', fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-600)' }}>{Math.round(b.completion)}%</span>
          </span>
          <span className="num" style={{ textAlign: 'right', fontSize: 'var(--vw-font-label-sm)', color: b.spentPct > b.completion + 10 ? 'var(--vw-color-red-600)' : 'var(--vw-color-slate-800)' }}>{Math.round(b.spentPct)}%<span style={{ display: 'block', fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)' }}>{money(b.spend)}</span></span>
          <span style={{ fontSize: 'var(--vw-font-label-sm)', fontWeight: 500, color: STATUS_TXT[b.status].color }}>{STATUS_TXT[b.status].label}</span>
        </Link>
      ))}
      {bars.length > limit && <div style={{ marginTop: 6 }}><Btn variant="ghost" onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show all ${bars.length}`}</Btn></div>}
    </div>
  );
}
/** The projects that need someone now, worst first, with the reasons in plain words. */
export function AttentionList({ rows, limit = 6 }: { rows: AttentionRow[]; limit?: number }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <Empty icon={CheckCircle2} title="Nothing needs attention">No red, blocked or stopped projects and nothing overdue.</Empty>;
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <div className="col" style={{ gap: 0 }}>
      {shown.map((a, i) => {
        const rag = (RAGS as readonly string[]).includes(a.row.project.rag) ? a.row.project.rag : 'Grey';
        return (
          <Link key={a.row.project.id} to={`/delivery/projects/${a.row.project.id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined, color: 'inherit', textDecoration: 'none' }}>
            <span style={{ minWidth: 0 }}>
              <span className="vw-flex vw-items-center" style={{ gap: 6, fontSize: 'var(--vw-font-label-sm)', fontWeight: 500, color: 'var(--vw-color-slate-900)', minWidth: 0 }} title={a.row.project.name}>
                <span style={{ width: 8, height: 8, borderRadius: 4, flex: 'none', background: RAG_FILL[rag] }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.row.project.name}</span>
              </span>
              <span style={{ display: 'block', fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)', marginLeft: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.row.stage}{a.row.program ? ` · ${a.row.program.name}` : ''}</span>
            </span>
            <span style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-700)' }}>{a.reasons.join(' · ')}</span>
          </Link>
        );
      })}
      {rows.length > limit && <div style={{ marginTop: 6 }}><Btn variant="ghost" onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</Btn></div>}
    </div>
  );
}

/** `milestones={false}` leaves milestones out of the tooltip (for screens that only show changes). */
export function DayStrip({ days, height = 190, milestones = true }: { days: DayLoad[]; height?: number; milestones?: boolean }) {
  const p = useVwPalette();
  const [wrapRef, width] = useMeasuredWidth(600);
  const { tip, show, hide } = useTip(wrapRef);
  const iw = Math.max(120, width - M.left - M.right), ih = height - M.top - M.bottom;
  const x = scaleBand<number>().domain(days.map((_, i) => i)).range([0, iw]).paddingInner(0.25);
  const max = niceMax(Math.max(...days.map(d => d.standard + d.normal + d.emergency)));
  const bh = ih - 14;
  const y = scaleLinear().domain([0, max]).range([bh, 0]);
  const COL = { standard: p.emerald, normal: p.blue, emergency: p.amber };
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }} onMouseLeave={hide}>
        <svg width={width} height={height} role="img" aria-label={milestones ? 'Change windows and milestones per day' : 'Change windows per day'}>
          <g transform={`translate(${M.left},${M.top + 14})`}>
            {y.ticks(3).map(v => <g key={v}><line x1={0} x2={iw} y1={y(v)} y2={y(v)} stroke={p.grid} /><text x={-8} y={y(v)} dy="0.32em" textAnchor="end" {...AXIS}>{v}</text></g>)}
            {days.map((d, i) => {
              const weekend = ['Sat', 'Sun'].includes(d.weekday);
              let acc = 0;
              const seg = (n: number, col: string, k: string) => { if (!n) return null; const y0 = y(acc), y1 = y(acc + n); acc += n; return <rect key={k} x={x(i)} y={y1} width={x.bandwidth()} height={y0 - y1} fill={col} />; };
              return (
                <g key={d.day} onMouseMove={e => show(e, <TipRows title={`${d.weekday} ${d.label}${d.freeze ? ` · freeze: ${d.freeze.name}` : ''}`} rows={[['Standard changes', d.standard], ['Normal changes', d.normal], ['Emergency changes', d.emergency], ...(d.kitShort ? [['Kit not at site', d.kitShort] as [string, number]] : []), ...(milestones ? [['Milestones due', d.milestones.length] as [string, number], ...d.milestones.slice(0, 3).map(m => ['·', m.name] as [string, string])] : [])]} />)}>
                  {(weekend || d.freeze) && <rect x={x(i)! - x.step() * 0.125} y={-14} width={x.step()} height={bh + 14} fill={d.freeze ? 'var(--vw-color-amber-50)' : 'var(--vw-color-slate-50)'} />}
                  <rect x={x(i)! - x.step() * 0.125} y={-14} width={x.step()} height={bh + 30} fill="transparent" />
                  {seg(d.standard, COL.standard, 's')}{seg(d.normal, COL.normal, 'n')}{seg(d.emergency, COL.emergency, 'e')}
                  {d.milestones.length > 0 && <rect x={x(i)! + x.bandwidth() / 2 - 4} y={-11} width={8} height={8} transform={`rotate(45 ${x(i)! + x.bandwidth() / 2} -7)`} fill={p.violet} />}
                  <text x={x(i)! + x.bandwidth() / 2} y={bh + 14} textAnchor="middle" {...AXIS} fontWeight={i === 0 ? 600 : 400}>{x.bandwidth() >= 40 ? `${d.weekday} ${d.label.split(' ')[0]}` : d.label.split(' ')[0]}</text>
                </g>
              );
            })}
          </g>
        </svg>
      <ChartTip tip={tip} width={width} />
    </div>
  );
}
