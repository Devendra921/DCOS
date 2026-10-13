/**
 * Rule gauge — a compact arc showing the share of applicable rules that pass, segmented
 * pass / warn / fail, with the counts as three small chips beneath.
 */
import { arc } from 'd3-shape';
import { useVwPalette } from '../../../site360/lib/siteModel';
import { VwChip } from '../../../../shared/components/ux';
import type { RuleGaugeProps } from './types';

const START = -Math.PI * 0.75, END = Math.PI * 0.75; // 270° sweep

export function RuleGauge({ findings, size = 140 }: RuleGaugeProps) {
  const p = useVwPalette();
  const pass = findings.filter((f) => f.status === 'pass').length;
  const warn = findings.filter((f) => f.status === 'warn').length;
  const fail = findings.filter((f) => f.status === 'fail').length;
  const na = findings.filter((f) => f.status === 'n/a').length;
  const applicable = pass + warn + fail;
  const pct = applicable ? Math.round((pass / applicable) * 100) : 0;
  const r = size / 2;
  const thick = Math.max(8, size * 0.1);
  const gen = arc<{ a0: number; a1: number }>().innerRadius(r - thick).outerRadius(r).startAngle((d) => d.a0).endAngle((d) => d.a1).cornerRadius(thick / 3);
  const sweep = END - START;
  const segs = (() => {
    const out: { a0: number; a1: number; color: string }[] = [];
    let a = START;
    for (const [n, color] of [[pass, p.emerald], [warn, p.amber], [fail, p.red]] as [number, string][]) {
      if (!n || !applicable) continue;
      const a1 = a + (n / applicable) * sweep;
      out.push({ a0: a, a1, color });
      a = a1;
    }
    return out;
  })();
  const tone = !applicable ? p.slate : fail ? p.red : warn ? p.amber : p.emerald;
  const label = !findings.length ? 'no rules' : !applicable ? 'none apply' : fail ? `${fail} hard fail${fail === 1 ? '' : 's'}` : warn ? `${warn} to review` : 'all pass';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={size} height={size * 0.86} viewBox={`0 0 ${size} ${size * 0.86}`} style={{ display: 'block', overflow: 'visible' }} role="img" aria-label={`${pct}% of rules pass`}>
        <g transform={`translate(${r},${r})`}>
          <path d={gen({ a0: START, a1: END }) ?? undefined} fill={p.grid} />
          {segs.map((s, i) => <path key={i} d={gen(s) ?? undefined} fill={s.color} style={{ transition: 'd 400ms ease' }} />)}
          <text textAnchor="middle" dy="0.1em" fontSize={size * 0.21} fontWeight={700} fill={applicable ? p.ink : p.slate}>{applicable ? `${pct}%` : '—'}</text>
          <text textAnchor="middle" dy="1.8em" fontSize={size * 0.075} fill={tone} fontWeight={600}>{label}</text>
          <text textAnchor="middle" y={r - thick / 2} dy="0.35em" fontSize={size * 0.065} fill={p.slate}>{applicable} of {findings.length} apply{na ? ` · ${na} n/a` : ''}</text>
        </g>
      </svg>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
        <VwChip variant="success" style={{ fontSize: 11, lineHeight: '16px', padding: '0 6px' }}>{pass} pass</VwChip>
        <VwChip variant="warning" style={{ fontSize: 11, lineHeight: '16px', padding: '0 6px' }}>{warn} warn</VwChip>
        <VwChip variant="error" style={{ fontSize: 11, lineHeight: '16px', padding: '0 6px' }}>{fail} fail</VwChip>
      </div>
    </div>
  );
}
