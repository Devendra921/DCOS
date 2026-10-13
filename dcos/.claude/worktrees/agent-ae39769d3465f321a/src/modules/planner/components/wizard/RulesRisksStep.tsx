/* Permits and risks panel: the risk register and the permits the plan needs. */
import { Input, InputNumber, Select, Tooltip } from 'antd';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { DeleteOutlined, PlusOutlined } from '../../../../shared/icons';
import type * as T from '../../../../mock/data/types';
import { SourceChip } from '../kit';
import { defaultPermits, fromDateInput, hasPermits, toDateInput, type StepProps } from './wizardModel';
import { SubTitle } from './ParamField';

const DOMAINS: T.PlannerRisk['domain'][] = ['Facility', 'Network', 'Supplier', 'Commissioning', 'Regulatory', 'Finance', 'Security'];
const LEVELS: T.PlannerRisk['probability'][] = ['Low', 'Medium', 'High'];
const PERMIT_STATUS: T.PlannerPermit['status'][] = ['Not started', 'Applied', 'In review', 'Approved', 'Expired'];

export function PermitsRisksPanel({ draft, patch, actions }: StepProps) {
  const permits = hasPermits(draft.scope);

  const updateRisk = (id: string, p: Partial<T.PlannerRisk>) => patch({ risks: draft.risks.map(r => (r.id === id ? { ...r, ...p } : r)) });
  const addRisk = () => patch({ risks: [...draft.risks, { id: actions.newId('R'), title: '', domain: 'Facility', probability: 'Medium', impact: 'Medium', owner: draft.ownerName, mitigation: '', source: 'user' }] });
  const updatePermit = (id: string, p: Partial<T.PlannerPermit>) => patch({ permits: draft.permits.map(x => (x.id === id ? { ...x, ...p } : x)) });
  const addPermit = () => patch({ permits: [...draft.permits, { id: actions.newId('PM'), name: '', authority: '', leadWeeks: 8, neededBefore: draft.targetGoLive, status: 'Not started' }] });
  const addDefaults = () => { const have = new Set(draft.permits.map(p => p.name.toLowerCase())); patch({ permits: [...draft.permits, ...defaultPermits(draft.scope, draft.targetGoLive).filter(p => !have.has(p.name.toLowerCase())).map(p => ({ ...p, id: actions.newId('PM') }))] }); };

  return (
    <div>
      <SubTitle extra={<Button size="small" icon={<PlusOutlined />} onClick={addRisk}>Add risk</Button>}>Risk register</SubTitle>
      <div>
        <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
          <thead><tr><th>Risk</th><th>Domain</th><th>Prob.</th><th>Impact</th><th>Owner</th><th>Mitigation</th><th>Source</th><th /></tr></thead>
          <tbody>
            {draft.risks.map(r => (
              <tr key={r.id}>
                <td><Tooltip title={r.evidence}><Input size="small" value={r.title} placeholder="Describe the risk" onChange={e => updateRisk(r.id, { title: e.target.value })} style={{ width: 220 }} /></Tooltip></td>
                <td><Select size="small" value={r.domain} style={{ width: 120 }} options={DOMAINS.map(d => ({ value: d, label: d }))} onChange={v => updateRisk(r.id, { domain: v })} /></td>
                <td><Select size="small" value={r.probability} style={{ width: 90 }} options={LEVELS.map(d => ({ value: d, label: d }))} onChange={v => updateRisk(r.id, { probability: v })} /></td>
                <td><Select size="small" value={r.impact} style={{ width: 90 }} options={LEVELS.map(d => ({ value: d, label: d }))} onChange={v => updateRisk(r.id, { impact: v })} /></td>
                <td><Input size="small" value={r.owner} onChange={e => updateRisk(r.id, { owner: e.target.value })} style={{ width: 130 }} /></td>
                <td><Input size="small" value={r.mitigation} placeholder="Mitigation" onChange={e => updateRisk(r.id, { mitigation: e.target.value })} style={{ width: 220 }} /></td>
                <td><SourceChip source={r.source} note={r.evidence} /></td>
                <td><Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove risk" onClick={() => patch({ risks: draft.risks.filter(x => x.id !== r.id) })} /></td>
              </tr>
            ))}
            {draft.risks.length === 0 && <tr><td colSpan={8} style={{ color: 'var(--vw-color-slate-500)' }}>No risks recorded yet.</td></tr>}
          </tbody>
        </table></div>
      </div>

      {permits && (<>
        <SubTitle extra={<span style={{ display: 'inline-flex', gap: 6 }}><Button size="small" onClick={addDefaults}>Add standard permits for this scope</Button><Button size="small" icon={<PlusOutlined />} onClick={addPermit}>Add permit</Button></span>}>Permits</SubTitle>
        <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
          <thead><tr><th>Permit</th><th>Authority</th><th style={{ textAlign: 'right' }}>Lead weeks</th><th>Needed before</th><th>Status</th><th /></tr></thead>
          <tbody>
            {draft.permits.map(p => (
              <tr key={p.id}>
                <td><Input size="small" value={p.name} placeholder="Permit" onChange={e => updatePermit(p.id, { name: e.target.value })} style={{ width: 240 }} /></td>
                <td><Input size="small" value={p.authority} placeholder="Authority" onChange={e => updatePermit(p.id, { authority: e.target.value })} style={{ width: 200 }} /></td>
                <td style={{ textAlign: 'right' }}><InputNumber size="small" min={0} max={120} value={p.leadWeeks} onChange={v => typeof v === 'number' && updatePermit(p.id, { leadWeeks: v })} style={{ width: 90 }} /></td>
                <td><Input size="small" type="date" value={toDateInput(p.neededBefore)} onChange={e => updatePermit(p.id, { neededBefore: fromDateInput(e.target.value, p.neededBefore) })} style={{ width: 150 }} /></td>
                <td><Select size="small" value={p.status} style={{ width: 120 }} options={PERMIT_STATUS.map(s => ({ value: s, label: s }))} onChange={v => updatePermit(p.id, { status: v })} /></td>
                <td><Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove permit" onClick={() => patch({ permits: draft.permits.filter(x => x.id !== p.id) })} /></td>
              </tr>
            ))}
            {draft.permits.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--vw-color-slate-500)' }}>No permits listed. Add the standard set for this scope to start.</td></tr>}
          </tbody>
        </table></div>
      </>)}

    </div>
  );
}

