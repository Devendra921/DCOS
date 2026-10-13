/* Network topology sheet: cores at the top, spines, leaves in pairs, rack groups at the bottom. Sized from the plan's network sizing. */
import { useVwPalette } from '../../../site360/lib/siteModel';
import type { Sizing } from '../../lib/engine';

const W = 720;
const MAX_LEAVES = 16, MAX_SPINES = 8, MAX_CORES = 4;

export function NetworkTopology({ network, racks, height = 300 }: { network: Sizing['network']; racks: number; height?: number }) {
  const pal = useVwPalette();
  const H = 300;
  const pad = 40;
  const span = W - pad * 2;
  const row = (n: number, y: number) => Array.from({ length: n }, (_, i) => ({ x: pad + (n === 1 ? span / 2 : (span * (i + 0.5)) / n), y }));

  const leavesDrawn = Math.min(network.leaves, MAX_LEAVES) - (Math.min(network.leaves, MAX_LEAVES) % 2 && network.leaves > 1 ? 1 : 0);
  const spinesDrawn = Math.min(network.spines, MAX_SPINES);
  const coresDrawn = Math.min(network.cores, MAX_CORES);
  const cores = row(coresDrawn, 34);
  const spines = row(spinesDrawn, 104);
  const leaves = row(leavesDrawn, 180);
  const pairs = Math.max(1, Math.ceil(leavesDrawn / 2));
  const groups = row(leavesDrawn ? pairs : 0, 256);
  const racksPerPair = network.leaves ? Math.ceil(racks / Math.max(1, network.leaves / 2)) : 0;
  const nodeW = (n: number, max: number) => Math.max(18, Math.min(max, span / Math.max(1, n) - 8));
  const more = (drawn: number, total: number, y: number, what: string) => (total > drawn ? <text x={W - 6} y={y + 4} textAnchor="end" fontSize={11} fill={pal.slate}>+{total - drawn} more {what}</text> : null);

  if (!network.leaves && !network.spines && !network.cores) {
    return <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} role="img" aria-label="No network in this plan"><text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill={pal.slate}>No switching fabric in this plan</text></svg>;
  }

  const lw = nodeW(leavesDrawn, 56), sw = nodeW(spinesDrawn, 80), cw = nodeW(coresDrawn, 90), gw = nodeW(pairs, 110);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} role="img" aria-label={`Network topology: ${network.cores} core, ${network.spines} spine, ${network.leaves} leaf switches`}>
      <g stroke={pal.slateLight} strokeWidth={0.8}>
        {cores.flatMap((c, i) => spines.map((s, j) => <line key={`cs${i}-${j}`} x1={c.x} y1={c.y + 11} x2={s.x} y2={s.y - 11} />))}
        {spines.flatMap((s, i) => leaves.map((l, j) => <line key={`sl${i}-${j}`} x1={s.x} y1={s.y + 11} x2={l.x} y2={l.y - 11} />))}
      </g>
      <g stroke={pal.slate} strokeWidth={1}>
        {groups.map((g, i) => [leaves[i * 2], leaves[i * 2 + 1]].filter(Boolean).map((l, k) => <line key={`lg${i}-${k}`} x1={l.x} y1={l.y + 11} x2={g.x} y2={g.y - 13} />))}
      </g>

      {cores.map((c, i) => <g key={`c${i}`}><rect x={c.x - cw / 2} y={c.y - 11} width={cw} height={22} rx={4} fill={pal.violet} /><text x={c.x} y={c.y + 4} textAnchor="middle" fontSize={10} fill={pal.surface}>Core {i + 1}</text></g>)}
      {spines.map((s, i) => <g key={`s${i}`}><rect x={s.x - sw / 2} y={s.y - 11} width={sw} height={22} rx={4} fill={pal.blue} /><text x={s.x} y={s.y + 4} textAnchor="middle" fontSize={10} fill={pal.surface}>{sw >= 50 ? `Spine ${i + 1}` : `S${i + 1}`}</text></g>)}
      {leaves.map((l, i) => <g key={`l${i}`}><rect x={l.x - lw / 2} y={l.y - 11} width={lw} height={22} rx={4} fill={pal.cyan} /><text x={l.x} y={l.y + 4} textAnchor="middle" fontSize={9} fill={pal.surface}>{lw >= 44 ? `Leaf ${i + 1}` : `L${i + 1}`}</text></g>)}
      {groups.map((g, i) => <g key={`g${i}`}><rect x={g.x - gw / 2} y={g.y - 13} width={gw} height={26} rx={3} fill={pal.surface} stroke={pal.slateLight} /><text x={g.x} y={g.y + 4} textAnchor="middle" fontSize={9} fill={pal.slateDark}>{gw >= 70 ? `${racksPerPair} racks` : racksPerPair}</text></g>)}

      <g fontSize={10} fill={pal.slate}>
        {coresDrawn > 0 && <text x={6} y={38}>Core</text>}
        {spinesDrawn > 0 && <text x={6} y={108}>Spine</text>}
        {leavesDrawn > 0 && <text x={6} y={184}>Leaf</text>}
        {leavesDrawn > 0 && <text x={6} y={260}>Racks</text>}
      </g>
      {more(coresDrawn, network.cores, 14, 'core')}
      {more(spinesDrawn, network.spines, 84, 'spine')}
      {more(leavesDrawn, network.leaves, 160, 'leaf')}
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={10} fill={pal.slate}>{network.uplinks.toLocaleString('en-US')} uplinks at {network.uplinkGbps} Gbps · leaves in pairs, each pair serves about {racksPerPair} racks · {network.carriers} carrier{network.carriers === 1 ? '' : 's'}</text>
    </svg>
  );
}
