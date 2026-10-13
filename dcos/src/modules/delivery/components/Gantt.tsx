/* Gantt / roadmap chart: labels in an HTML column, bars in an SVG that fills the remaining width
   (measured, so text never scales), month or quarter grid, today line, progress inside bars,
   milestone diamonds and optional dependency arrows between rows. */
import { useEffect, useState, type ReactNode } from 'react';

export type GanttTone = 'done' | 'active' | 'late' | 'todo' | 'blocked';
export interface GanttRow {
  id: string; label: ReactNode; sub?: ReactNode;
  /** Bars need a start; milestones only an end. */
  start?: string; end: string;
  kind?: 'bar' | 'milestone'; tone?: GanttTone;
  /** 0–100, drawn inside the bar. */
  progress?: number;
  /** Rows this one waits for (arrow from their end to this start). */
  dependsOn?: string[];
  tooltip?: string;
  onClick?: () => void;
}
/** Kept for older callers: label/start/end/status/kind items. */
export interface GanttItem { label: string; start: string; end: string; status?: string; kind?: 'task' | 'milestone' }

const TONE: Record<GanttTone, { stroke: string; fill: string }> = {
  done: { stroke: 'var(--vw-color-green-600)', fill: 'var(--vw-color-green-100)' },
  active: { stroke: 'var(--vw-color-blue-600)', fill: 'var(--vw-color-blue-100)' },
  late: { stroke: 'var(--vw-color-red-600)', fill: 'var(--vw-color-red-100)' },
  blocked: { stroke: 'var(--vw-color-amber-600)', fill: 'var(--vw-color-amber-100)' },
  todo: { stroke: 'var(--vw-color-slate-400)', fill: 'var(--vw-color-slate-100)' },
};
const STATUS_TONE: Record<string, GanttTone> = { Done: 'done', Completed: 'done', 'In Progress': 'active', Blocked: 'blocked', Delayed: 'late', 'To Do': 'todo', 'Not Started': 'todo' };
const t = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);
const monthStart = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const addMonths = (ms: number, n: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime(); };

export function Gantt({ rows: rowsIn, items, labelWidth = 260, rowH = 34, empty = 'Nothing is scheduled yet.' }: { rows?: GanttRow[]; items?: GanttItem[]; labelWidth?: number; rowH?: number; empty?: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    if (!host) return;
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(host);
    return () => ro.disconnect();
  }, [host]);

  const rows: GanttRow[] = (rowsIn ?? (items ?? []).map((it, i) => ({ id: String(i), label: it.label, start: it.start, end: it.end, kind: it.kind === 'milestone' ? 'milestone' as const : 'bar' as const, tone: STATUS_TONE[it.status ?? ''] ?? 'todo', tooltip: it.status })))
    .filter((r) => Number.isFinite(t(r.end)) && (r.kind === 'milestone' || Number.isFinite(t(r.start))));
  if (!rows.length) return <div ref={setHost} className="vw-card-description">{empty}</div>;

  const times = rows.flatMap((r) => [t(r.end), ...(r.kind === 'milestone' ? [] : [t(r.start)])]);
  const min = monthStart(Math.min(...times));
  const max = addMonths(monthStart(Math.max(...times)), 1);
  const months = Math.max(1, Math.round((max - min) / (30.44 * 864e5)));
  const step = months > 36 ? 6 : months > 15 ? 3 : 1;
  const ticks: number[] = []; for (let m = min; m < max; m = addMonths(m, step)) ticks.push(m);

  const headH = 24;
  const chartW = Math.max(240, w - labelWidth);
  const bodyH = headH + rows.length * rowH;
  const H = bodyH + 16;
  const x = (ms: number) => 8 + ((ms - min) / (max - min)) * (chartW - 16);
  const y = (i: number) => headH + i * rowH;
  const index = new Map(rows.map((r, i) => [r.id, i]));

  return (
    <div ref={setHost} style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Project schedule">
    <div style={{ display: 'grid', gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`, width: '100%', minWidth: labelWidth + 240 }}>
      <div>
        <div style={{ height: headH }} />
        {rows.map((r, i) => (
          <div key={r.id} onClick={r.onClick} title={typeof r.label === 'string' ? r.label : undefined}
            style={{ height: rowH, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 12, borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined, cursor: r.onClick ? 'pointer' : undefined, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
            {r.sub && <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</div>}
          </div>
        ))}
      </div>
      <div style={{ minWidth: 0 }}>
        {w > 0 && (
          <svg width={chartW} height={H} style={{ display: 'block' }} role="img" aria-label="Schedule">
            <defs>
              <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--vw-color-slate-400)" /></marker>
            </defs>
            {rows.map((r, i) => i > 0 && <line key={`r${r.id}`} x1={0} x2={chartW} y1={y(i)} y2={y(i)} stroke="var(--vw-color-slate-100)" />)}
            {ticks.map((m) => (
              <g key={m}>
                <line x1={x(m)} x2={x(m)} y1={headH - 4} y2={bodyH} stroke="var(--vw-color-slate-200)" />
                <text x={x(m) + 4} y={14} fontSize={11} fill="var(--vw-color-slate-500)">{new Date(m).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</text>
              </g>
            ))}
            {rows.flatMap((r, i) => (r.dependsOn ?? []).map((dep) => {
              const j = index.get(dep); const p = j === undefined ? undefined : rows[j];
              if (!p || r.kind === 'milestone') return null;
              const x1 = x(t(p.end)), y1 = y(j!) + rowH / 2, x2 = x(t(r.start)), y2 = y(i) + rowH / 2;
              const mid = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 10));
              return <path key={`d${dep}-${r.id}`} d={`M${x1},${y1} H${mid} V${y2} H${Math.max(mid, x2 - 1)}`} fill="none" stroke="var(--vw-color-slate-400)" strokeWidth={1.2} markerEnd="url(#gantt-arrow)" />;
            }))}
            {rows.map((r, i) => {
              const tone = TONE[r.tone ?? 'todo'];
              const cy = y(i) + rowH / 2;
              if (r.kind === 'milestone') {
                const mx = x(t(r.end));
                return (
                  <g key={r.id} onClick={r.onClick} style={{ cursor: r.onClick ? 'pointer' : undefined }}>
                    <title>{r.tooltip ?? ''}</title>
                    <polygon points={`${mx},${cy - 7} ${mx + 7},${cy} ${mx},${cy + 7} ${mx - 7},${cy}`} fill={tone.stroke} />
                  </g>
                );
              }
              const x1 = x(t(r.start)), x2 = Math.max(x1 + 4, x(t(r.end)));
              const bw = x2 - x1, prog = Math.max(0, Math.min(100, r.progress ?? 0));
              return (
                <g key={r.id} onClick={r.onClick} style={{ cursor: r.onClick ? 'pointer' : undefined }}>
                  <title>{r.tooltip ?? ''}</title>
                  <rect x={x1} y={cy - 8} width={bw} height={16} rx={3} fill={tone.fill} stroke={tone.stroke} strokeWidth={1} />
                  {prog > 0 && <rect x={x1} y={cy - 8} width={(bw * prog) / 100} height={16} rx={3} fill={tone.stroke} opacity={0.45} />}
                </g>
              );
            })}
            {now >= min && now <= max && (
              <g>
                <line x1={x(now)} x2={x(now)} y1={headH - 4} y2={bodyH + 2} stroke="var(--vw-color-red-500)" strokeDasharray="3 3" />
                <text x={x(now)} y={H - 3} fontSize={10} textAnchor="middle" fill="var(--vw-color-red-600)">Today</text>
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
    </div>
  );
}
export default Gantt;
