import { Empty, Tooltip } from 'antd';

export interface GanttItem { label: string; start: string; end: string; status?: string; kind?: 'task' | 'milestone' }
const COLOR: Record<string, string> = { Done: 'var(--vw-color-green-600)', Completed: 'var(--vw-color-green-600)', 'In Progress': '#2563eb', Blocked: 'var(--vw-color-red-600)', Delayed: 'var(--vw-color-red-600)', 'To Do': 'var(--vw-color-slate-400)', 'Not Started': 'var(--vw-color-slate-400)' };

const startOfMonth = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const addMonth = (t: number, n: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime(); };

/** Interactive Gantt: month grid, today marker, status-coloured bars, milestone
 *  diamonds, hover tooltips. Horizontally scrollable. */
export function Gantt({ items, rowH = 30 }: { items: GanttItem[]; rowH?: number }) {
  const valid = items.filter((i) => !isNaN(new Date(i.start).getTime()) && !isNaN(new Date(i.end).getTime()));
  if (!valid.length) return <Empty description="No scheduled items" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const times = valid.flatMap((i) => [new Date(i.start).getTime(), new Date(i.end).getTime()]);
  const min = startOfMonth(Math.min(...times));
  const max = addMonth(startOfMonth(Math.max(...times)), 1);
  const span = Math.max(1, max - min);

  const labelW = 190;
  const monthCount = Math.max(1, Math.round((max - min) / (30 * 864e5)));
  const barW = Math.max(360, monthCount * 90);
  const W = labelW + barW + 16;
  const headerH = 26;
  const H = headerH + valid.length * rowH + 12;
  const xOf = (t: number) => labelW + ((t - min) / span) * barW;

  const months: number[] = [];
  for (let t = min; t < max; t = addMonth(t, 1)) months.push(t);
  const today = Date.now();

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
        {months.map((t, k) => (
          <g key={k}>
            <line x1={xOf(t)} y1={headerH - 6} x2={xOf(t)} y2={H - 6} stroke="#f1f5f9" />
            <text x={xOf(t) + 4} y={14} fontSize="10" fill="var(--vw-color-slate-400)">{new Date(t).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</text>
          </g>
        ))}
        {today >= min && today <= max && (
          <g>
            <line x1={xOf(today)} y1={headerH - 6} x2={xOf(today)} y2={H - 6} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" />
            <text x={xOf(today) + 3} y={headerH - 10} fontSize="9" fill="#ef4444">today</text>
          </g>
        )}
        {valid.map((it, i) => {
          const y = headerH + i * rowH;
          const x1 = xOf(new Date(it.start).getTime());
          const x2 = xOf(new Date(it.end).getTime());
          const c = COLOR[it.status ?? ''] ?? '#7c3aed';
          const cy = y + rowH / 2;
          const mid = (x1 + x2) / 2;
          return (
            <g key={i}>
              {i % 2 === 1 && <rect x={0} y={y} width={W} height={rowH} fill="#fafbfc" />}
              <text x={8} y={cy + 3} fontSize="10.5" fill="#334155">{it.label.length > 26 ? it.label.slice(0, 25) + '…' : it.label}</text>
              {it.kind === 'milestone' ? (
                <Tooltip title={`◇ ${it.label} · ${new Date(it.end).toLocaleDateString()} · ${it.status ?? ''}`}>
                  <polygon points={`${x2},${cy - 7} ${x2 + 7},${cy} ${x2},${cy + 7} ${x2 - 7},${cy}`} fill={c} stroke="#fff" style={{ cursor: 'pointer' }} />
                </Tooltip>
              ) : (
                <Tooltip title={`${it.label} · ${new Date(it.start).toLocaleDateString()} → ${new Date(it.end).toLocaleDateString()} · ${it.status ?? ''}`}>
                  <rect x={x1} y={y + 6} width={Math.max(6, x2 - x1)} height={rowH - 14} rx={4} fill={`color-mix(in srgb, ${c} 20%, transparent)`} stroke={c} strokeWidth={1.5} style={{ cursor: 'pointer' }} />
                </Tooltip>
              )}
              {it.kind !== 'milestone' && (x2 - x1) > 36 && <text x={mid} y={cy + 3} textAnchor="middle" fontSize="8.5" fill={c}>{it.status}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
export default Gantt;
