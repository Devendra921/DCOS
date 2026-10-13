import type { ReactNode } from 'react';
import './dash-kit.css';

export interface Slice { label: string; value: number; color: string }

/** SVG donut with the total in the middle and a count legend underneath. */
export function DonutChart({ data, centerLabel = 'total', size = 156, thickness = 16 }: { data: Slice[]; centerLabel?: string; size?: number; thickness?: number }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = (size - thickness) / 2, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="dk-donut">
      <div className="dk-donut-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--vw-color-slate-100)" strokeWidth={thickness} />
          {total > 0 && data.filter((d) => d.value > 0).map((d) => {
            const len = (C * d.value) / total;
            const el = <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={thickness} strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-acc} />;
            acc += len;
            return el;
          })}
        </svg>
        <div className="dk-donut-mid"><b>{total.toLocaleString()}</b><small>{centerLabel}</small></div>
      </div>
      <div className="dk-legend">
        {data.map((d) => (
          <div key={d.label}><i style={{ background: d.color }} />{d.label}<b>{d.value}</b><span>{total ? Math.round((d.value / total) * 100) : 0}%</span></div>
        ))}
      </div>
    </div>
  );
}

/** Ranked horizontal bars: label, bar scaled to the max, value, optional share. */
export function HBarList({ rows, format = (v) => String(v), color = 'var(--primaryColor500)', showShare = true }: { rows: Array<{ label: string; value: number; color?: string }>; format?: (v: number) => string; color?: string; showShare?: boolean }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  return (
    <div className="dk-hbars">
      {rows.map((r) => (
        <div key={r.label} className="dk-hbar">
          <span className="dk-hbar-label" title={r.label}>{r.label}</span>
          <div className="dk-hbar-track"><i style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color }} /></div>
          <b>{format(r.value)}</b>
          {showShare && <em>{Math.round((r.value / total) * 100)}%</em>}
        </div>
      ))}
    </div>
  );
}

/** Vertical bucket chart (histogram) with value labels above each column. */
export function ColumnBuckets({ rows, height = 150 }: { rows: Array<{ label: string; value: number; color: string }>; height?: number }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="dk-cols" style={{ height }}>
      {rows.map((r) => (
        <div key={r.label} className="dk-col">
          <b>{r.value}</b>
          <div className="dk-col-bar"><i style={{ height: `${Math.max((r.value / max) * 100, r.value ? 4 : 0)}%`, background: r.color }} /></div>
          <span>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export function DashCard({ title, sub, extra, children, className = '' }: { title: ReactNode; sub?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`dk-card ${className}`}>
      <div className="dk-card-head"><h3>{title}</h3>{(sub || extra) && <span>{sub}{extra}</span>}</div>
      {children}
    </div>
  );
}
