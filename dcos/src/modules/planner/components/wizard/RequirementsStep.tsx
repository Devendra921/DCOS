/* Step 2 — Requirements: what the end user needs, in their words. Where, how much, when, what runs
   in the racks, how critical. The fields depend on the plan type. On Next, these answers fill the
   inputs of every dimension step (shown below as a preview), marked "From your requirements". */
import { useMemo } from 'react';
import { Input, InputNumber, Slider } from 'antd';
import { Wand2 } from 'lucide-react';
import { Chip, Panel, Seg } from '../../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../../ops/ui/Analytics';
import type * as T from '../../../../mock/data/types';
import { fmtKw } from '../../lib/engine';
import { REQUIREMENTS, capacityFromRequirements, deriveFromRequirements, type RequirementField } from '../../lib/dimensions';
import { FieldError, ReqLabel } from '../kit';
import { fmtParam, fromDateInput, paramDefsFor, toDateInput, type StepProps } from './wizardModel';
import { Field, StepTitle, SubTitle } from './ParamField';
import { SitePicker } from './SitePicker';
import { AffectedAssets } from './AffectedAssets';
import { uiFor } from '../scopes/registry';

type MixKey = 'gpuPct' | 'computePct' | 'storagePct';
const MIX: { key: MixKey; label: string; hint: string }[] = [
  { key: 'gpuPct', label: 'GPU and accelerators', hint: 'AI training and inference' },
  { key: 'computePct', label: 'General compute', hint: 'Virtual machines, applications' },
  { key: 'storagePct', label: 'Storage', hint: 'Object, block, backup' },
];
function rebalance(d: T.PlannerDemand, key: MixKey, value: number): T.PlannerDemand {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const others = MIX.map(m => m.key).filter(k => k !== key);
  const rest = 100 - v; const cur = others.reduce((a, k) => a + d[k], 0);
  const out = { ...d, [key]: v } as T.PlannerDemand;
  if (cur <= 0) { out[others[0]] = rest; out[others[1]] = 0; } else { out[others[0]] = Math.round((d[others[0]] / cur) * rest); out[others[1]] = rest - out[others[0]]; }
  return out;
}
const TIER_TEXT: Record<string, string> = { 'Tier II': 'Some downtime for maintenance is acceptable.', 'Tier III': 'Any part can be maintained without stopping the load.', 'Tier IV': 'Survives any single failure without stopping the load.' };

export function RequirementsStep(props: StepProps) {
  const { draft, patch, setParam, template, ev, templates, benchmarks, issues = [] } = props;
  const err = (field: string) => issues.filter(i => i.field === field).map(i => i.text).join(' ') || undefined;
  const fields = REQUIREMENTS[draft.scope];
  const has = (f: RequirementField) => fields.includes(f);
  const defs = useMemo(() => paramDefsFor(ev, templates, draft.dcTypeKey), [ev, templates, draft.dcTypeKey]);
  const num = (k: string) => Number(draft.params[k] ?? defs.get(k)?.default ?? 0);
  /** Set a requirement parameter; keep the kW capacity in step for scopes sized in racks or sites. */
  const setReq = (key: string, v: number | string) => {
    setParam(key, v, 'user');
    const next = { ...draft, params: { ...draft.params, [key]: v } };
    if (['rackCount', 'densityKwPerRack', 'siteCount', 'kwPerSite'].includes(key)) patch({ designPowerKw: capacityFromRequirements(next) });
    if (key === 'densityKwPerRack') patch({ demand: { ...draft.demand, densityKwPerRack: Number(v) } });
  };

  const preview = useMemo(() => deriveFromRequirements(draft, template, benchmarks), [draft, template, benchmarks]);
  const sum = draft.demand.gpuPct + draft.demand.computePct + draft.demand.storagePct;
  const capacityLabel = draft.scope === 'migration' ? 'IT load moving' : draft.scope === 'plant' ? 'IT load the plant must carry' : draft.scope === 'expansion' ? 'Extra IT capacity needed' : 'IT capacity needed';

  return (
    <div>
      <StepTitle title="What do you need?" description="Answer in your own terms. These answers fill the inputs of every following step; you only change what differs." />

      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <Field label={<ReqLabel>Plan name</ReqLabel>}><Input value={draft.title} status={err('title') ? 'error' : undefined} aria-required placeholder="e.g. Frankfurt AI campus · 50 MW" onChange={e => patch({ title: e.target.value })} /><FieldError text={err('title')} /></Field>
        <Field label={<ReqLabel>{draft.scope === 'migration' ? 'Finished by' : 'Needed by'}</ReqLabel>}><Input type="date" status={err('targetGoLive') ? 'error' : undefined} aria-required value={toDateInput(draft.targetGoLive)} onChange={e => patch({ targetGoLive: fromDateInput(e.target.value, draft.targetGoLive) })} /><FieldError text={err('targetGoLive')} /></Field>
      </div>
      <div style={{ marginTop: 8 }}>
        <Field label="What is this plan for?"><Input.TextArea value={draft.intent} autoSize={{ minRows: 2, maxRows: 4 }} placeholder="The need in a sentence or two: who asked for it, why, and any constraint the reviewers should know." onChange={e => patch({ intent: e.target.value })} /></Field>
      </div>

      <SubTitle><ReqLabel>Where</ReqLabel></SubTitle>
      {err('site') && <div style={{ marginBottom: 6 }}><FieldError text={err('site')} /></div>}
      {(() => { const ui = uiFor(draft.scope); const Picker = ui.sitePicker ?? SitePicker; const Extra = ui.requirements; return <><Picker {...props} />{has('affected') && <AffectedAssets {...props} />}{Extra && <Extra {...props} />}</>; })()}

      {fields.some(f => ['capacityKw', 'rackCount', 'densityKwPerRack', 'siteCount', 'kwPerSite', 'dciGbpsRequired', 'racksToMove', 'growth', 'tenancy'].includes(f)) && <SubTitle>How much</SubTitle>}
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {has('capacityKw') && <Field label={<ReqLabel>{capacityLabel}</ReqLabel>} hint={err('capacity') ? <FieldError text={err('capacity')} /> : draft.designPowerKw >= 1000 ? fmtKw(draft.designPowerKw) : undefined}><InputNumber style={{ width: '100%' }} status={err('capacity') ? 'error' : undefined} value={draft.designPowerKw} min={0} step={draft.designPowerKw >= 1000 ? 500 : 10} addonAfter="kW" onChange={v => typeof v === 'number' && patch({ designPowerKw: v })} /></Field>}
        {has('rackCount') && <Field label="Racks needed"><InputNumber style={{ width: '100%' }} value={num('rackCount')} min={1} onChange={v => typeof v === 'number' && setReq('rackCount', v)} /></Field>}
        {has('densityKwPerRack') && <Field label="Power per rack"><InputNumber style={{ width: '100%' }} value={num('densityKwPerRack')} min={1} max={150} addonAfter="kW" onChange={v => typeof v === 'number' && setReq('densityKwPerRack', v)} /></Field>}
        {has('siteCount') && <Field label="Number of sites"><InputNumber style={{ width: '100%' }} value={num('siteCount')} min={1} onChange={v => typeof v === 'number' && setReq('siteCount', v)} /></Field>}
        {has('kwPerSite') && <Field label="IT load per site"><InputNumber style={{ width: '100%' }} value={num('kwPerSite')} min={1} addonAfter="kW" onChange={v => typeof v === 'number' && setReq('kwPerSite', v)} /></Field>}
        {has('dciGbpsRequired') && <Field label="Interconnect capacity needed"><InputNumber style={{ width: '100%' }} value={num('dciGbpsRequired')} min={100} step={100} addonAfter="Gbps" onChange={v => typeof v === 'number' && setReq('dciGbpsRequired', v)} /></Field>}
        {has('racksToMove') && <Field label="Racks to move"><InputNumber style={{ width: '100%' }} value={num('racksToMove')} min={1} onChange={v => typeof v === 'number' && setReq('racksToMove', v)} /></Field>}
        {has('growth') && <Field label="Demand growth per year" hint="When installed capacity runs out"><InputNumber style={{ width: '100%' }} min={0} max={100} value={draft.demand.growthPctPerYear} addonAfter="%" onChange={v => typeof v === 'number' && patch({ demand: { ...draft.demand, growthPctPerYear: v } })} /></Field>}
        {has('tenancy') && <Field label="Who uses it"><Seg<T.PlannerDemand['tenancy']> value={draft.demand.tenancy} onChange={v => patch({ demand: { ...draft.demand, tenancy: v } })} options={[{ id: 'single', label: 'Us' }, { id: 'multi', label: 'Several tenants' }]} /></Field>}
        {(draft.scope === 'rack' || draft.scope === 'pod' || draft.scope === 'edge') && <Field label="Total IT load"><div style={{ fontSize: 18, fontWeight: 600, paddingTop: 2 }}>{fmtKw(draft.designPowerKw)}</div>{!has('capacityKw') && <FieldError text={err('capacity')} />}</Field>}
      </div>

      {has('workload') && (<>
        <SubTitle extra={<Chip tone={sum === 100 ? 'success' : 'error'} dot>{sum}%</Chip>}>What runs in the racks</SubTitle>
        {err('workload') && <FieldError text={err('workload')} />}
        <div className="grid g-3" style={{ gap: 8 }}>
          {MIX.map(m => (
            <Panel key={m.key}>
              <div className="row between"><span className="strong" style={{ fontSize: 13 }}>{m.label}</span><b className="num">{draft.demand[m.key]}%</b></div>
              <Slider min={0} max={100} value={draft.demand[m.key]} onChange={v => patch({ demand: rebalance(draft.demand, m.key, v) })} tooltip={{ formatter: v => `${v}%` }} style={{ margin: '6px 0' }} />
              <div className="vw-label" style={{ fontSize: 11 }}>{m.hint}</div>
            </Panel>
          ))}
        </div>
      </>)}

      {has('tier') && (<>
        <SubTitle>How critical is it?</SubTitle>
        <div className="grid g-3" style={{ gap: 8 }}>
          {['Tier II', 'Tier III', 'Tier IV'].map(t => { const sel = String(draft.params.tier ?? defs.get('tier')?.default ?? 'Tier III') === t; return (
            <div key={t} role="button" tabIndex={0} aria-pressed={sel} onClick={() => setReq('tier', t)} onKeyDown={e => { if (e.key === 'Enter') setReq('tier', t); }} className="tile" style={{ gap: 2, cursor: 'pointer', borderColor: sel ? 'var(--primaryColor500)' : undefined, background: sel ? 'var(--primaryColor50)' : undefined }}>
              <div className="strong" style={{ fontWeight: 600, fontSize: 13 }}>{t}</div><div className="vw-label" style={{ fontSize: 12 }}>{TIER_TEXT[t]}</div>
            </div>
          ); })}
        </div>
      </>)}

      {preview.length > 0 && (
        <Panel icon={Wand2} style={{ marginTop: 16 }} title={`From these answers the planner fills ${preview.length} inputs`} sub="You can change any of them on the next steps">
          <div className="grid g-2" style={{ gap: '0 24px' }}>
            {preview.map(d => { const def = defs.get(d.key); return (
              <div key={d.key} className="row between" style={{ padding: '4px 0', borderBottom: '1px solid var(--vw-color-slate-100)', fontSize: 12 }}>
                <span style={{ minWidth: 0 }}><span className="strong">{def?.label ?? d.key}</span> <span className="vw-label">· {d.why}</span></span>
                <b className="num" style={{ whiteSpace: 'nowrap' }}>{fmtParam(d.key, d.value, def?.unit)}</b>
              </div>
            ); })}
          </div>
        </Panel>
      )}
      {ev && draft.designPowerKw > 0 && (
        <div style={{ marginTop: 12 }}><StatGrid cols={4}>
          <StatTile label="IT capacity" value={fmtKw(ev.sizing.itKw)} />
          <StatTile label="Racks" value={ev.sizing.racks.toLocaleString('en-US')} />
          <StatTile label="Halls" value={ev.sizing.halls} />
          <StatTile label="Buildings" value={ev.sizing.buildings} />
        </StatGrid></div>
      )}
    </div>
  );
}
