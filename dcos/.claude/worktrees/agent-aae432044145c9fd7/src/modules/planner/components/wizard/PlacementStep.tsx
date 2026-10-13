/* Rack and pod scopes — placement panel on the Space step: the optimiser ranks live racks at the chosen site by free power, free U, feed and utilisation after placement. */
import { useMemo } from 'react';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { RobotOutlined } from '../../../../shared/icons';
import { placementCandidates } from '../../lib/ai';
import { SourceChip } from '../kit';
import type { StepProps } from './wizardModel';

export function PlacementPanel({ draft, patch, estate, actions }: StepProps) {
  const racksWanted = Math.max(1, Number(draft.params.rackCount ?? 1));
  const needKw = Number(draft.params.densityKwPerRack ?? draft.demand.densityKwPerRack);
  const needU = Number(draft.params.rackUnitsNeeded ?? 10);
  const chosen = String(draft.params['placementRackIds'] ?? '').split(',').filter(Boolean);
  const candidates = useMemo(() => placementCandidates(draft, estate.racks, estate.halls, needKw, needU), [draft, estate.racks, estate.halls, needKw, needU]);
  const dc = estate.dataCenters.find(d => d.id === draft.dataCenterId);
  const toggle = (id: string, accepted: boolean) => {
    const next = chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id];
    patch({ params: { ...draft.params, placementRackIds: next.join(',') }, paramSources: { ...draft.paramSources, placementRackIds: 'ai' } });
    actions.recordFeedback('placement-optimiser', draft.id, accepted, id);
  };

  return (
    <div>
      <div className="vw-card-description" style={{ marginBottom: 8 }}>{dc ? <>Racks at <b>{dc.name}</b> that can take <b>{racksWanted}</b> rack{racksWanted === 1 ? '' : 's'} of <b>{needKw} kW</b> and <b>{needU} U</b>. Accepted {chosen.length} of {racksWanted}. Nothing is reserved until you accept.</> : 'Choose the site in Requirements to rank its racks.'}</div>
      <VwCard variant="child-shaded" title={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><RobotOutlined /> Placement optimiser <SourceChip source="actual" note="Ranked on live rack power, space and feed data" /></span>}>
        {!dc && <div className="vw-card-description">No site selected.</div>}
        {dc && candidates.length === 0 && <div className="vw-card-description">No active rack at {dc.name} can take {needKw} kW and {needU} U.</div>}
        <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
          <thead><tr><th>Rank</th><th>Rack</th><th>Hall</th><th style={{ textAlign: 'right' }}>Free kW</th><th style={{ textAlign: 'right' }}>Free U</th><th>Feed</th><th>Score</th><th>Why</th><th /></tr></thead>
          <tbody>{candidates.map((c, i) => { const on = chosen.includes(c.rack.id); return (
            <tr key={c.rack.id} className={on ? 'is-selected' : undefined}>
              <td>{i + 1}</td><td style={{ fontWeight: 500 }}>{c.rack.name}</td><td>{c.hallName}</td>
              <td style={{ textAlign: 'right' }}>{Math.max(0, c.rack.maxPowerKw - c.rack.currentPowerKw).toFixed(1)}</td><td style={{ textAlign: 'right' }}>{c.rack.availableU}</td><td>{c.rack.redundancy}</td>
              <td><VwChip variant={c.score >= 85 ? 'success' : c.score >= 55 ? 'warning' : 'error'}>{c.score}</VwChip></td>
              <td style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>{c.reasons.join(' · ')}</td>
              <td><button type="button" className={`nst-btn nst-btn--xs ${on ? 'nst-btn--gray' : 'nst-btn--filled'}`} onClick={() => toggle(c.rack.id, !on)}>{on ? 'Release' : 'Accept'}</button></td>
            </tr>); })}</tbody>
        </table></div>
      </VwCard>
    </div>
  );
}
