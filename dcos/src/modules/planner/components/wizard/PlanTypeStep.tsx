/* Step 1 — Plan type. The choice fixes the wizard: which dimensions it asks about, which inputs,
   which rules and who approves. */
import { useMemo } from 'react';
import { Route } from 'lucide-react';
import { Chip, Panel } from '../../../../ops/ui/kit';
import { DC_TYPE_CATALOG } from '../../../../mock/data/dcTypes';
import { modelFor } from '../../lib/scopes';
import type * as T from '../../../../mock/data/types';
import { capacityFromRequirements, dimensionsFor, requirementParamKeys } from '../../lib/dimensions';
import { SITE_MODE, type StepProps } from './wizardModel';
import { StepTitle, SubTitle } from './ParamField';

const EXISTING: T.PlannerScope[] = ['rack', 'pod', 'hall', 'retrofit', 'plant', 'network', 'migration'];
const REPLACE: T.PlannerScope[] = ['server-refresh', 'network-refresh', 'rack-replace'];
const NEW: T.PlannerScope[] = ['expansion', 'new-dc', 'edge', 'portfolio'];

export function PlanTypeStep({ draft, patch, templates, template }: StepProps) {
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
  const Card = ({ t }: { t: T.PlannerTemplate }) => {
    const sel = draft.templateId === t.id;
    const d = dimensionsFor(t);
    return (
      <div role="button" tabIndex={0} aria-pressed={sel} onClick={() => choose(t)} onKeyDown={e => { if (e.key === 'Enter') choose(t); }} className="tile"
        style={{ gap: 4, cursor: 'pointer', borderColor: sel ? 'var(--primaryColor500)' : undefined, background: sel ? 'var(--primaryColor50)' : undefined }}>
        <div className="row between"><span className="strong" style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</span>{sel && <Chip tone="info" size="xs">Selected</Chip>}</div>
        <div className="vw-label" style={{ fontSize: 12 }}>{t.description}</div>
        <div className="vw-label" style={{ fontSize: 11 }}>{d.length} areas · becomes a {t.executesAs ?? 'plan'}{t.inheritsFrom ? ' · site variant' : ''}</div>
      </div>
    );
  };

  return (
    <div>
      <StepTitle title="What are you planning?" description="Pick a plan type. It decides which areas the wizard asks about, which inputs, which rules apply and who approves." />

      <SubTitle>On an existing site</SubTitle>
      <div className="planner-type-grid">{planTypes.filter(t => t.scope && EXISTING.includes(t.scope)).map(t => <Card key={t.id} t={t} />)}</div>
      <SubTitle>Replace or refresh</SubTitle>
      <div className="planner-type-grid">{planTypes.filter(t => t.scope && REPLACE.includes(t.scope)).map(t => <Card key={t.id} t={t} />)}</div>
      <SubTitle>New capacity</SubTitle>
      <div className="planner-type-grid">{planTypes.filter(t => t.scope && NEW.includes(t.scope)).map(t => <Card key={t.id} t={t} />)}</div>

      {template && (
        <Panel icon={Route} style={{ marginTop: 16 }} title={`${template.name}: what happens next`}>
          <div className="grid g-1-2">
            <div className="note note--info" style={{ flexDirection: 'column', gap: 2 }}>
              <strong>Where it happens</strong>
              {{ existing: 'Inside a live site. You pick the site next; its kind, tier and climate set the defaults.', 'two-sites': 'Between two live sites. You pick both ends next.', migration: 'From a live site to another, or a decommission. You pick the sites next.', campus: 'On a campus you already run. You pick the campus and name the new building next.', new: 'On a new site. You choose the region, location, climate and kind of site next.', region: 'Across a region. You pick the region and the sites to consider next.' }[SITE_MODE[template.scope ?? draft.scope]]}
            </div>
            <div>
              <div className="strong" style={{ fontSize: 12, marginBottom: 6 }}>The wizard will ask about {dims.length} areas, then you compare options and submit</div>
              <div className="row wrap" style={{ gap: 4 }}>{dims.map(({ dim, depth }) => <Chip key={dim.key} tone={depth === 'full' ? 'info' : 'neutral'} size="xs">{dim.label}{depth === 'summary' ? ' · brief' : ''}</Chip>)}</div>
              <div className="vw-label" style={{ fontSize: 12, marginTop: 8 }}>Approved by {template.approvalPath.join(' → ') || 'no one'}; produces {template.outputs.join(', ').toLowerCase()}.</div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
