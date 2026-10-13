/* Step 1 — Plan type. The choice fixes the wizard: which dimensions it asks about, which inputs,
   which rules and who approves. An optional sentence lets the AI pick the plan type and site type. */
import { useMemo, useState } from 'react';
import { Input } from 'antd';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { VwCard, VwChip } from '../../../../shared/components/ux';
import { RobotOutlined, CheckOutlined, CloseOutlined } from '../../../../shared/icons';
import { DC_TYPE_CATALOG } from '../../../../mock/data/dcTypes';
import { modelFor } from '../../lib/scopes';
import type * as T from '../../../../mock/data/types';
import { readIntent, type IntentReading } from '../../lib/ai';
import { SCOPE_LABEL, fmtKw } from '../../lib/engine';
import { capacityFromRequirements, dimensionsFor, requirementParamKeys } from '../../lib/dimensions';
import { applyIntent, INTENT_EXAMPLES, SITE_MODE, mixForSiteType, type StepProps } from './wizardModel';
import { StepTitle, SubTitle } from './ParamField';

const EXISTING: T.PlannerScope[] = ['rack', 'pod', 'hall', 'retrofit', 'plant', 'network', 'migration'];
const REPLACE: T.PlannerScope[] = ['server-refresh', 'network-refresh', 'rack-replace'];
const NEW: T.PlannerScope[] = ['expansion', 'new-dc', 'edge', 'portfolio'];

export function PlanTypeStep({ draft, patch, estate, templates, actions, template }: StepProps) {
  const [text, setText] = useState(draft.intent);
  const [reading, setReading] = useState<IntentReading | null>(null);
  const planTypes = useMemo(() => templates.filter(t => t.kind === 'plan' && t.status === 'published'), [templates]);
  const dims = useMemo(() => dimensionsFor(template), [template]);

  /** Choosing a plan type fixes the wizard and seeds its requirement inputs with the template defaults. */
  const choose = (t: T.PlannerTemplate) => {
    const scope = t.scope ?? draft.scope;
    const params = { ...draft.params }; const paramSources = { ...draft.paramSources };
    for (const key of requirementParamKeys(scope)) { const def = t.params.find(p => p.key === key); if (def?.default !== undefined && params[key] === undefined) { params[key] = def.default; paramSources[key] = 'template'; } }
    const next = { ...draft, templateId: t.id, scope, params, paramSources };
    const prof = DC_TYPE_CATALOG.find(p => p.key === draft.dcTypeKey);
    const sized = capacityFromRequirements(next);
    const siteKw = prof ? Math.round(((prof.powerKw[0] + (prof.powerKw[1] ?? prof.powerKw[0] * 4)) / 2) / 100) * 100 : 1000;
    // A sensible starting size per plan type; the user sets the real figure in Requirements.
    const startKw: Partial<Record<T.PlannerScope, number>> = { 'server-refresh': 0, 'network-refresh': 0, 'rack-replace': 0, hall: prof?.highDensity ? 2500 : 1500, retrofit: 800, plant: 2000, network: 0, migration: 200, expansion: Math.max(2000, Math.round(siteKw / 2 / 100) * 100), 'new-dc': siteKw, portfolio: siteKw, edge: sized };
    const designPowerKw = ['rack', 'pod', 'edge'].includes(scope) ? sized : scope !== draft.scope || !draft.designPowerKw ? startKw[scope] ?? siteKw : draft.designPowerKw;
    // Clear site fields that the new plan type's site picker does not use.
    const mode = SITE_MODE[scope];
    const site: Partial<T.PlannerPlan> = mode === 'new' || mode === 'region' ? { dataCenterId: undefined, peerDataCenterId: undefined } : mode === 'campus' ? { dataCenterId: undefined, peerDataCenterId: undefined } : mode === 'existing' ? { newSiteName: undefined, peerDataCenterId: undefined } : { newSiteName: undefined };
    if (mode !== 'existing') delete params.targetHallId;
    const base: Partial<T.PlannerPlan> = { templateId: t.id, scope, params, paramSources, designPowerKw, ...(SITE_MODE[draft.scope] !== mode ? site : {}) };
    patch({ ...base, ...(modelFor(scope).seedDraft?.({ ...draft, ...base } as T.PlannerPlan) ?? {}) });
  };
  const read = (value = text) => { if (!value.trim()) return; setText(value); setReading(readIntent(value, estate)); };
  const accept = () => {
    if (!reading) return;
    const p = applyIntent(draft, reading, text, estate, templates);
    patch({ ...p, demand: { ...draft.demand, ...mixForSiteType(reading.dcTypeKey), ...(p.demand ? { densityKwPerRack: p.demand.densityKwPerRack } : {}) } });
    actions.recordFeedback('intent-to-profile', draft.id, true, `${reading.dcTypeKey} / ${reading.scope}`);
    setReading(null);
  };
  const reject = () => { if (reading) actions.recordFeedback('intent-to-profile', draft.id, false, reading.dcTypeKey); setReading(null); };

  const Card = ({ t }: { t: T.PlannerTemplate }) => {
    const sel = draft.templateId === t.id;
    const d = dimensionsFor(t);
    return (
      <div role="button" tabIndex={0} onClick={() => choose(t)} onKeyDown={e => { if (e.key === 'Enter') choose(t); }} className={`vw-card-child vw-card--clickable${sel ? ' vw-card--info' : ''}`}
        style={{ padding: '10px 12px', border: sel ? '1px solid var(--primaryColor500)' : '1px solid transparent', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm"><span style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</span>{sel && <VwChip variant="info">Selected</VwChip>}</div>
        <div style={{ fontSize: 12, color: 'var(--vw-color-slate-600)' }}>{t.description}</div>
        <div style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>{d.length} areas · becomes a {t.executesAs ?? 'plan'}{t.inheritsFrom ? ' · site variant' : ''}</div>
      </div>
    );
  };

  return (
    <div>
      <StepTitle title="What are you planning?" description="Pick a plan type. It decides which areas the wizard asks about, which inputs, which rules apply and who approves. You can also describe the need and let the planner pick." />

      <VwCard variant="child-shaded" title={<span className="vw-flex vw-items-center vw-gap-xs"><RobotOutlined /> Describe it (optional)</span>}>
        <div className="vw-flex vw-gap-sm">
          <Input value={text} onChange={e => setText(e.target.value)} onPressEnter={() => read()} placeholder="e.g. Plan a new 50 MW AI data centre in Frankfurt for 2028, Tier III, liquid cooled" />
          <Button type="primary" onClick={() => read()} disabled={!text.trim()}>Read</Button>
        </div>
        <div className="vw-flex vw-gap-xs vw-wrap" style={{ marginTop: 8 }}>{INTENT_EXAMPLES.map(ex => <VwChip key={ex} variant="neutral" onClick={() => read(ex)} style={{ cursor: 'pointer' }}>{ex}</VwChip>)}</div>
        {reading && (
          <div className="vw-card-child" style={{ padding: 12, marginTop: 10 }}>
            <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm vw-wrap">
              <span style={{ fontSize: 13 }}>Reads as <b>{SCOPE_LABEL[reading.scope]}</b> for a <b>{reading.profile.name}</b>{reading.kw ? <> of <b>{fmtKw(reading.kw)}</b></> : null}{reading.campusHint ? <> near <b>{reading.campusHint}</b></> : null}{reading.tier ? <>, <b>{reading.tier}</b></> : null}. <VwChip variant="purple">{reading.confidence}% confidence</VwChip></span>
              <span className="vw-flex vw-gap-xs"><Button size="small" type="primary" icon={<CheckOutlined />} onClick={accept}>Use this</Button><Button size="small" icon={<CloseOutlined />} onClick={reject}>Not right</Button></span>
            </div>
            {reading.reasons.length > 0 && <div style={{ fontSize: 12, color: 'var(--vw-color-slate-500)', marginTop: 4 }}>Why: {reading.reasons.join('; ')}.</div>}
          </div>
        )}
      </VwCard>

      <SubTitle>On an existing site</SubTitle>
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>{planTypes.filter(t => t.scope && EXISTING.includes(t.scope)).map(t => <Card key={t.id} t={t} />)}</div>
      <SubTitle>Replace or refresh</SubTitle>
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>{planTypes.filter(t => t.scope && REPLACE.includes(t.scope)).map(t => <Card key={t.id} t={t} />)}</div>
      <SubTitle>New capacity</SubTitle>
      <div className="vw-grid vw-gap-sm" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>{planTypes.filter(t => t.scope && NEW.includes(t.scope)).map(t => <Card key={t.id} t={t} />)}</div>

      {template && (
        <VwCard variant="child" style={{ marginTop: 16 }} title={`${template.name}: what happens next`}>
          <div className="vw-grid vw-gap-md" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)' }}>
            <div className="vw-card-child-shaded" style={{ padding: '8px 12px', fontSize: 12, color: 'var(--vw-color-slate-600)' }}>
              <div style={{ fontWeight: 600, color: 'var(--vw-color-slate-800)', marginBottom: 2 }}>Where it happens</div>
              {{ existing: 'Inside a live site. You pick the site next; its kind, tier and climate set the defaults.', 'two-sites': 'Between two live sites. You pick both ends next.', migration: 'From a live site to another, or a decommission. You pick the sites next.', campus: 'On a campus you already run. You pick the campus and name the new building next.', new: 'On a new site. You choose the region, location, climate and kind of site next.', region: 'Across a region. You pick the region and the sites to consider next.' }[SITE_MODE[template.scope ?? draft.scope]]}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--vw-color-slate-700)', marginBottom: 6 }}>The wizard will ask about {dims.length} areas, then you compare options and submit</div>
              <div className="vw-flex vw-gap-xs vw-wrap">{dims.map(({ dim, depth }) => <VwChip key={dim.key} variant={depth === 'full' ? 'info' : 'neutral'}>{dim.label}{depth === 'summary' ? ' · brief' : ''}</VwChip>)}</div>
              <div style={{ fontSize: 12, color: 'var(--vw-color-slate-500)', marginTop: 8 }}>Approved by {template.approvalPath.join(' → ') || 'no one'}; produces {template.outputs.join(', ').toLowerCase()}.</div>
            </div>
          </div>
        </VwCard>
      )}
    </div>
  );
}
