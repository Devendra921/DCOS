/* Plant upgrade wizard panels and plan views: site baseline, power and cooling steps, stages and cut-ins. */
import { Input, InputNumber, Select } from 'antd';
import { VwButton as Button } from '../../../../../shared/components/vw/VwButton';
import { VwChip } from '../../../../../shared/components/ux';
import { DeleteOutlined, PlusOutlined } from '../../../../../shared/icons';
import type * as T from '../../../../../mock/data/types';
import { dcTypeName } from '../../../../../mock/data/dcTypes';
import { fmtKw, fmtUsd } from '../../../lib/engine';
import { POWER_SYSTEMS, SYSTEM_LABEL, type PlantAnalysis } from '../../../lib/plantModel';
import { plantOf } from '../../../lib/scopes/plant';
import { Stat } from '../../kit';
import { SubTitle } from '../../wizard/ParamField';
import { climateFromHint, fmtDay, fromDateInput, toDateInput, type StepProps } from '../../wizard/wizardModel';
import type { PlanViewProps } from '../types';
import { AsIsOneLine, PlantSystemsTable } from './PlantSystems';
import { CutInEditor, PlantLinesEditor } from './PlantEditors';

const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 } as const;
const COOLING = ['chiller', 'cooling'] as const;
const stagesOf = (plan: T.PlannerPlan) => { const ph = [...plan.phases].sort((a, b) => a.goLive.localeCompare(b.goLive)); return ph.length ? ph.map((p, i) => ({ stage: i + 1, name: p.name })) : [{ stage: 1, name: 'Stage 1' }]; };

function Headline({ an }: { an: PlantAnalysis }) {
  const b = an.baseline!;
  return (
    <div style={grid4}>
      <Stat label="IT load today" value={fmtKw(b.itLoadKw)} sub={`${fmtKw(b.itReservedKw + b.itPipelineKw)} held by other plans`} />
      <Stat label="Site can accept today" value={fmtKw(an.headroomBeforeKw)} sub={b.binding ? `bound by ${SYSTEM_LABEL[b.binding].split(' (')[0].toLowerCase()}` : 'no rated plant recorded'} />
      <Stat label="After the works" value={fmtKw(an.capacityEnabledKw)} tone={an.capacityEnabledKw > an.headroomBeforeKw ? 'ok' : undefined} sub={an.bindingAfter ? `bound by ${SYSTEM_LABEL[an.bindingAfter].split(' (')[0].toLowerCase()}` : undefined} />
      <Stat label="Plant added" value={fmtKw(an.addedPlantKw)} sub={`${an.lines.length} line${an.lines.length === 1 ? '' : 's'}`} />
    </div>
  );
}
const Warnings = ({ an }: { an: PlantAnalysis }) => (an.baseline?.warnings.length ? <div style={{ fontSize: 12, color: 'var(--vw-color-slate-500)', marginTop: 6 }}>{an.baseline.warnings.join('. ')}.</div> : null);

/** Requirements: pick the live site and see its plant per system (not "free IT power"). */
export function PlantSitePicker(props: StepProps) {
  const { draft, patch, data, ev } = props;
  const an = plantOf(ev);
  const sites = data.dataCenters.filter(d => d.status === 'Operational' || d.status === 'Construction' || d.id === draft.dataCenterId).sort((a, b) => a.code.localeCompare(b.code));
  const pick = (id: string) => { const dc = data.dataCenters.find(d => d.id === id); if (!dc) return; const campus = data.campuses.find(c => c.id === dc.campusId); patch({ dataCenterId: dc.id, campusId: dc.campusId, regionId: campus?.regionId ?? draft.regionId, dcTypeKey: dc.dcTypeKey ?? draft.dcTypeKey, climate: climateFromHint(campus?.city) ?? draft.climate, newSiteName: undefined, plantLines: draft.dataCenterId === dc.id ? draft.plantLines : [], cutIns: draft.dataCenterId === dc.id ? draft.cutIns : [] }); };
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>A plant upgrade works on the plant a live site already has. Pick the site; its plant is read from the records per system, at the redundancy you target.</div>
      <Select showSearch optionFilterProp="label" value={draft.dataCenterId} placeholder="Pick the site" style={{ maxWidth: 520 }} options={sites.map(d => ({ value: d.id, label: `${d.code} · ${d.name} · ${dcTypeName(d.dcTypeKey ?? '') || 'kind not set'} · ${d.tier}${d.status !== 'Operational' ? ` · ${d.status}` : ''}` }))} onChange={pick} />
      {draft.dataCenterId && !an?.ready && <span className="vw-card-description">{an?.reason ?? 'Reading the site…'}</span>}
      {an?.baseline && (<>
        <Headline an={an} />
        <PlantSystemsTable an={an} />
        <div style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>Load to support (from the capacity above): {fmtKw(draft.designPowerKw)} of IT on top of {fmtKw(an.baseline.committedItKw)} committed. * load estimated from the IT load where the plant has no meter reading.</div>
        <Warnings an={an} />
      </>)}
    </div>
  );
}

export function PlantPowerPanel(props: StepProps) {
  const an = plantOf(props.ev);
  if (!an?.baseline) return <div className="vw-card-description">{an?.reason ?? 'Pick the site in Requirements.'}</div>;
  return (<>
    <Headline an={an} />
    <SubTitle>Power plant, as-is and to-be</SubTitle>
    <AsIsOneLine an={an} systems={['utility', 'transformer', 'generator', 'ups']} />
    <SubTitle>What is added, replaced or uprated</SubTitle>
    <PlantLinesEditor {...props} an={an} systems={POWER_SYSTEMS} stages={stagesOf(props.draft)} />
    <SubTitle>Per system</SubTitle>
    <PlantSystemsTable an={an} systems={POWER_SYSTEMS} />
    {an.runtimeAfterMin !== undefined && <div style={{ fontSize: 12, color: 'var(--vw-color-slate-500)', marginTop: 6 }}>Battery runtime after the works: about {an.runtimeAfterMin} min at the planned load (recorded {an.baseline.runtimeMin} min at today’s load).</div>}
  </>);
}

export function PlantCoolingPanel(props: StepProps) {
  const an = plantOf(props.ev);
  if (!an?.baseline) return <div className="vw-card-description">{an?.reason ?? 'Pick the site in Requirements.'}</div>;
  return (<>
    <AsIsOneLine an={an} systems={['chiller', 'cooling']} />
    <SubTitle>Cooling zones</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Zone</th><th style={{ textAlign: 'right' }}>Units</th><th style={{ textAlign: 'right' }}>Usable</th><th style={{ textAlign: 'right' }}>Load</th><th style={{ textAlign: 'right' }}>Headroom</th></tr></thead>
      <tbody>{an.baseline.zones.map(z => <tr key={z.zone.id}><td>{z.zone.name}</td><td style={{ textAlign: 'right' }}>{z.units.length}</td><td style={{ textAlign: 'right' }}>{fmtKw(z.usableKw)}</td><td style={{ textAlign: 'right' }}>{fmtKw(z.loadKw)}</td><td style={{ textAlign: 'right' }}>{fmtKw(z.usableKw - z.loadKw)}</td></tr>)}
        {!an.baseline.zones.length && <tr><td colSpan={5} style={{ color: 'var(--vw-color-slate-500)' }}>No cooling zones recorded.</td></tr>}</tbody>
    </table></div>
    <SubTitle>What is added, replaced or uprated</SubTitle>
    <PlantLinesEditor {...props} an={an} systems={[...COOLING]} stages={stagesOf(props.draft)} />
    <SubTitle>Per system</SubTitle>
    <PlantSystemsTable an={an} systems={[...COOLING]} />
    <Warnings an={an} />
  </>);
}

/** Stages (each with its own items and need date) and the cut-in sequence. */
export function PlantDeliveryPanel(props: StepProps) {
  const { draft, patch, ev } = props;
  const an = plantOf(ev);
  const phases = [...draft.phases].sort((a, b) => a.goLive.localeCompare(b.goLive));
  const total = phases.reduce((a, p) => a + p.itKw, 0);
  const setPhase = (id: string, p: Partial<T.PlannerPhase>) => patch({ phases: draft.phases.map(x => (x.id === id ? { ...x, ...p } : x)) });
  const addStage = () => { const last = phases[phases.length - 1]; const goLive = last ? new Date(new Date(last.goLive).getTime() + 90 * 864e5).toISOString() : draft.targetGoLive; patch({ phases: [...draft.phases, { id: `PH-${Date.now().toString(36)}`, name: `Stage ${phases.length + 1}`, goLive, itKw: Math.max(0, draft.designPowerKw - total), racks: 0, halls: 0, status: 'Planned' }], targetGoLive: goLive > draft.targetGoLive ? goLive : draft.targetGoLive }); };
  return (<>
    <SubTitle extra={<Button size="small" icon={<PlusOutlined />} onClick={addStage}>Add a stage</Button>}>Stages</SubTitle>
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>#</th><th>Stage</th><th>Handover</th><th style={{ textAlign: 'right' }}>Load it enables</th><th>Lines</th><th>Gates</th><th /></tr></thead>
      <tbody>{phases.map((p, i) => {
        const st = an?.stages.find(s => s.stage === i + 1);
        return (
          <tr key={p.id}>
            <td>{i + 1}</td>
            <td><Input size="small" value={p.name} style={{ width: 200 }} onChange={e => setPhase(p.id, { name: e.target.value })} /></td>
            <td><Input size="small" type="date" value={toDateInput(p.goLive)} style={{ width: 150 }} onChange={e => setPhase(p.id, { goLive: fromDateInput(e.target.value, p.goLive) })} /></td>
            <td style={{ textAlign: 'right' }}><InputNumber size="small" min={0} step={100} value={p.itKw} addonAfter="kW" style={{ width: 130 }} onChange={v => setPhase(p.id, { itKw: v ?? 0 })} /></td>
            <td>{(draft.plantLines ?? []).filter(l => (l.stage ?? 1) === i + 1).map(l => `${l.qty} × ${l.system}`).join(', ') || '—'}</td>
            <td style={{ fontSize: 12 }}>{st ? `MOP ${fmtDay(st.mop)} · FAT ${fmtDay(st.fat)} · delivery ${fmtDay(st.delivery)}` : '—'}</td>
            <td>{phases.length > 1 && <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove stage" onClick={() => patch({ phases: draft.phases.filter(x => x.id !== p.id) })} />}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
    {phases.length > 0 && total !== draft.designPowerKw && <div style={{ fontSize: 12, color: 'var(--vw-color-red-600)', marginTop: 4 }}>Stages enable {fmtKw(total)}; the plan supports {fmtKw(draft.designPowerKw)}. Make them match.</div>}
    <SubTitle>Cut-in sequence</SubTitle>
    <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)', marginBottom: 6 }}>Each step: what is taken out of service, how the live load is carried, the redundancy left, what is exposed, and how it is undone. A step whose remaining capacity is below the live load cannot be submitted.</div>
    <CutInEditor {...props} an={an} stages={phases.map((p, i) => ({ stage: i + 1, name: p.name }))} />
  </>);
}

/** Plan page tab and pack section: as-is / to-be, per system, and the cut-in sequence. */
export function PlantView({ ev, plan }: PlanViewProps) {
  const an = plantOf(ev);
  if (!an?.baseline) return <div className="vw-card-description">{an?.reason ?? 'No site'}</div>;
  return (
    <div className="vw-flex vw-flex-col vw-gap-sm">
      <Headline an={an} />
      <AsIsOneLine an={an} />
      <PlantSystemsTable an={an} />
      <CutInTable an={an} />
      <div style={{ fontSize: 12, color: 'var(--vw-color-slate-500)' }}>{plan.plantLines?.length ?? 0} plant lines; CapEx {fmtUsd(ev.estimate.capexTotal)} from the bill plus contingency; {fmtUsd(ev.estimate.opexMonthly)} a month added OpEx.</div>
    </div>
  );
}
export function CutInTable({ an }: { an: PlantAnalysis }) {
  if (!an.cutIns.length) return <div className="vw-card-description">No cut-in steps.</div>;
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>#</th><th>Step</th><th>Isolated</th><th>Transfer</th><th style={{ textAlign: 'right' }}>Left / live</th><th>Redundancy</th><th style={{ textAlign: 'right' }}>Racks</th><th style={{ textAlign: 'right' }}>Services</th><th>Window</th><th>Change</th></tr></thead>
      <tbody>{an.cutIns.map(c => (
        <tr key={c.step.id}>
          <td>{c.order}</td><td>{c.step.title}</td><td>{c.isolated.map(u => u.name).join(', ') || '—'}</td><td>{c.step.transfer}</td>
          <td style={{ textAlign: 'right' }}>{fmtKw(c.remainingKw + c.temporaryKw)} / {fmtKw(c.liveLoadKw)}</td>
          <td><VwChip variant={!c.ok ? 'error' : c.redundancyLeft === 'N+1 or better' ? 'success' : 'warning'}>{c.ok ? c.redundancyLeft : 'Short'}</VwChip></td>
          <td style={{ textAlign: 'right' }}>{c.exposedRackIds.length}</td><td style={{ textAlign: 'right' }}>{c.services}{c.critical ? ` (${c.critical} critical)` : ''}</td>
          <td>{fmtDay(c.window.start)}{c.window.proposed ? ' (proposed)' : ''}{c.clashes.length ? ` · ${c.clashes.length} clash` : ''}</td>
          <td>{c.step.changeRequestId ?? '—'}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
