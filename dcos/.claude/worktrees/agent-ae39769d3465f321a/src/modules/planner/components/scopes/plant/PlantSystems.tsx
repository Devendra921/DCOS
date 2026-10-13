/* Plant baseline per system and the as-is / to-be one-line, drawn from the site's records. */
import { VwChip } from '../../../../../shared/components/ux';
import { useVwPalette } from '../../../../site360/lib/siteModel';
import { fmtKw } from '../../../lib/engine';
import { SYSTEM_LABEL, SYSTEM_ORDER, type PlantAnalysis, type PlantSystem, type PlantUnit } from '../../../lib/plantModel';
import { Legend } from '../../charts/ChartBits';

const num = { textAlign: 'right' as const };

/** Installed, usable at redundancy, load, held by other plans, needed with this plan, and after the works. */
export function PlantSystemsTable({ an, systems }: { an: PlantAnalysis; systems?: PlantSystem[] }) {
  const b = an.baseline; if (!b) return null;
  const rows = b.systems.filter(s => !systems || systems.includes(s.system));
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>System</th><th>Redundancy</th><th style={num}>Units</th><th style={num}>Installed</th><th style={num}>Usable</th><th style={num}>Load today</th><th style={num}>Held by others</th><th style={num}>Needed with this plan</th><th style={num}>Usable after</th><th>Result</th></tr></thead>
      <tbody>{rows.map(s => {
        const a = an.after.find(x => x.system === s.system);
        const short = s.recorded && a && a.usableKw < s.requiredKw;
        return (
          <tr key={s.system}>
            <td title={s.basis}>{s.label}</td>
            <td>{s.recorded ? s.redundancy : '—'}</td>
            <td style={num}>{s.units.length}</td>
            <td style={num}>{s.recorded ? fmtKw(s.installedKw) : '—'}</td>
            <td style={num}>{s.recorded ? fmtKw(s.usableKw) : '—'}</td>
            <td style={num} title={s.loadSource}>{fmtKw(s.loadKw)}{s.loadSource !== 'measured' ? ' *' : ''}</td>
            <td style={num}>{fmtKw(s.reservedKw + s.pipelineKw)}</td>
            <td style={num} title={`(committed + plan load × ${s.factor}) × ${s.margin}`}>{fmtKw(s.requiredKw)}</td>
            <td style={num}>{a && (s.recorded || a.units.length) ? `${fmtKw(a.usableKw)}${a.deltaUsableKw ? ` (${a.deltaUsableKw > 0 ? '+' : ''}${fmtKw(a.deltaUsableKw)})` : ''}` : '—'}</td>
            <td>{!s.recorded ? <VwChip variant="neutral">Not recorded</VwChip> : short ? <VwChip variant="error">Short {fmtKw((s.requiredKw) - (a?.usableKw ?? 0))}</VwChip> : <VwChip variant="success">Meets</VwChip>}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

interface Box { u: PlantUnit; state: 'existing' | 'new' | 'removed' | 'uprated' }
/** One lane per system: the units in the records, new units dashed, replaced units struck through. */
export function AsIsOneLine({ an, systems = SYSTEM_ORDER }: { an: PlantAnalysis; systems?: PlantSystem[] }) {
  const p = useVwPalette();
  const b = an.baseline; if (!b) return null;
  const lanes = systems.map(sys => {
    const before = b.systems.find(s => s.system === sys)?.units ?? [];
    const after = an.after.find(s => s.system === sys)?.units ?? [];
    const boxes: Box[] = [
      ...before.map(u => { const now = after.find(x => x.id === u.id); return { u, state: !now ? 'removed' as const : now.capacityKw !== u.capacityKw ? 'uprated' as const : 'existing' as const }; }),
      ...after.filter(u => u.isNew).map(u => ({ u, state: 'new' as const })),
    ];
    return { sys, boxes };
  }).filter(l => l.boxes.length);
  const MAX = 9, BW = 92, BH = 34, GAP = 8, LX = 150, LH = 50;
  const W = LX + MAX * (BW + GAP) + 60, H = Math.max(1, lanes.length) * LH + 10;
  const color = (s: Box['state']) => (s === 'new' ? p.emerald : s === 'removed' ? p.red : s === 'uprated' ? p.amber : p.blue);
  if (!lanes.length) return <div className="vw-card-description">No plant recorded at the site and none added.</div>;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxHeight: H * 1.2 }} role="img" aria-label="Plant by system, as-is and to-be">
        {lanes.map((l, i) => {
          const y = 8 + i * LH; const shown = l.boxes.slice(0, MAX);
          return (
            <g key={l.sys}>
              <text x={0} y={y + 14} fontSize={11} fontWeight={600} fill={p.ink}>{SYSTEM_LABEL[l.sys].split(' (')[0]}</text>
              <text x={0} y={y + 28} fontSize={10} fill={p.slate}>{b.systems.find(s => s.system === l.sys)?.redundancy}</text>
              <line x1={LX - 10} y1={y + BH / 2} x2={LX + shown.length * (BW + GAP)} y2={y + BH / 2} stroke={p.grid} strokeWidth={2} />
              {shown.map((x, k) => (
                <g key={x.u.id} transform={`translate(${LX + k * (BW + GAP)},${y})`}>
                  <title>{`${x.u.name} · ${fmtKw(x.u.capacityKw)}${x.u.side ? ` · ${x.u.side} side` : ''} · ${x.state}`}</title>
                  <rect width={BW} height={BH} rx={5} fill={p.surface} stroke={color(x.state)} strokeWidth={1.5} strokeDasharray={x.state === 'new' ? '4 3' : undefined} />
                  <text x={6} y={14} fontSize={10} fontWeight={600} fill={p.ink}>{x.u.name.length > 15 ? `${x.u.name.slice(0, 14)}…` : x.u.name}</text>
                  <text x={6} y={27} fontSize={9.5} fill={p.slate}>{fmtKw(x.u.capacityKw)}{x.u.side ? ` · ${x.u.side}` : ''}</text>
                  {x.state === 'removed' && <line x1={4} y1={BH - 4} x2={BW - 4} y2={4} stroke={p.red} strokeWidth={1.5} />}
                </g>
              ))}
              {l.boxes.length > MAX && <text x={LX + MAX * (BW + GAP)} y={y + 21} fontSize={10} fill={p.slate}>+{l.boxes.length - MAX} more</text>}
            </g>
          );
        })}
      </svg>
      <Legend style={{ marginTop: 6 }} items={[{ label: 'In the records', color: p.blue, kind: 'line' }, { label: 'Added by this plan', color: p.emerald, kind: 'dash' }, { label: 'Replaced', color: p.red, kind: 'line' }, { label: 'Uprated', color: p.amber, kind: 'line' }]} />
    </div>
  );
}
