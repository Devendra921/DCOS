/* Plan wizard. The plan type (template) fixes the wizard: Plan type → Requirements → one step per
   dimension the template requires → Scenarios → Review. Requirements fill the dimension inputs
   (marked "From your requirements"); every input lives on exactly one step.
   New plans start at /planning/new (optional ?intent=, ?scope=, ?template=); /planning/plans/:planId/edit resumes. */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Spin, Tooltip } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { DetailPageHeader } from '../../../shared/components/ux';
import { ArrowLeftOutlined, ArrowRightOutlined, SaveOutlined, SendOutlined } from '../../../shared/icons';
import type * as T from '../../../mock/data/types';
import type { ParamValue } from '../lib/engine';
import { DIMENSIONS, applyDerived, deriveFromRequirements, dimensionsFor } from '../lib/dimensions';
import { newPlanDraft, useActuals, useBenchmarks, useDraftEvaluation, useEstate, usePlan, usePlannerActions, useTemplates } from '../lib/usePlanner';
import { StatusChip, ScopeChip } from '../components/kit';
import { usePlannerData } from '../lib/plannerData';
import { blockers, ensureSinglePhase, stepsFor, type StepKey, type StepProps } from '../components/wizard/wizardModel';
import { LiveEstimateRail } from '../components/wizard/LiveEstimateRail';
import { WizardNav } from '../components/wizard/WizardNav';
import { PlanTypeStep } from '../components/wizard/PlanTypeStep';
import { RequirementsStep } from '../components/wizard/RequirementsStep';
import { DimensionStep } from '../components/wizard/DimensionStep';
import { ScenariosStep } from '../components/wizard/ScenariosStep';
import { ReviewStep } from '../components/wizard/ReviewStep';

/** Keyed by plan so moving between /planning/new and /planning/plans/:id/edit never carries one draft into another. */
export default function PlanWizardPage() {
  const { planId } = useParams();
  const [sp] = useSearchParams();
  return <PlanWizard key={`${planId ?? 'new'}:${sp.get('template') ?? ''}:${sp.get('intent') ?? ''}`} />;
}

function PlanWizard() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { message } = App.useApp();
  const actions = usePlannerActions();
  const existing = usePlan(planId);
  const templates = useTemplates();
  const benchmarks = useBenchmarks();
  const estate = useEstate();
  const data = usePlannerData();

  const [local, setLocal] = useState<T.PlannerPlan | null>(() => (planId ? null : newPlanDraft({ intent: sp.get('intent') ?? '', title: sp.get('title') ?? '', ...(sp.get('scope') ? { scope: sp.get('scope') as T.PlannerScope } : {}), ...(sp.get('template') ? { templateId: sp.get('template')! } : {}) }, actions.actor)));
  const draft = local ?? existing;
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(planId ? [planId] : []));
  const saved = !!draft && savedIds.has(draft.id);
  const template = useMemo(() => templates.find(t => t.id === draft?.templateId), [templates, draft?.templateId]);
  const steps = useMemo(() => stepsFor(template), [template]);
  const [stepState, setStepState] = useState<number | null>(planId ? null : 0);
  const step = Math.min(steps.length - 1, Math.max(0, stepState ?? ((existing?.wizardStep ?? 1) - 1)));
  const [maxVisitedState, setMaxVisited] = useState<number | null>(planId ? null : 0);
  const maxVisited = Math.max(step, maxVisitedState ?? (planId ? steps.length - 1 : step));

  const actuals = useActuals(draft?.dcTypeKey);
  const ev = useDraftEvaluation(draft);
  const why = useMemo(() => (draft ? Object.fromEntries(deriveFromRequirements(draft, template, benchmarks).map(d => [d.key, d.why])) : {}), [draft, template, benchmarks]);

  const patch = useCallback((p: Partial<T.PlannerPlan>) => setLocal(d => ({ ...(d ?? existing!), ...p })), [existing]);
  const setParam = useCallback((key: string, value: ParamValue, source: T.PlannerParamSource = 'user') => setLocal(d => { const base = d ?? existing!; return { ...base, params: { ...base.params, [key]: value }, paramSources: { ...base.paramSources, [key]: source } }; }), [existing]);
  const resetParam = useCallback((key: string) => setLocal(d => { const base = d ?? existing!; const params = { ...base.params }; const sources = { ...base.paramSources }; delete params[key]; delete sources[key]; return { ...base, params, paramSources: sources }; }), [existing]);

  const persist = useCallback((at?: number, base?: T.PlannerPlan): T.PlannerPlan => {
    const cur = base ?? draft!;
    const ownsPhases = steps.some(s => s.key === 'dim:delivery' || s.key === 'dim:migration') && !['rack', 'pod', 'plant', 'network'].includes(cur.scope);
    const phases = !ownsPhases || cur.phases.length === 0 ? ensureSinglePhase(cur, ev) : cur.phases;
    const rec = actions.savePlan({ ...cur, phases, title: cur.title || 'Untitled plan', wizardStep: (at ?? step) + 1 });
    setLocal(rec);
    setSavedIds(s => (s.has(rec.id) ? s : new Set([...s, rec.id])));
    return rec;
  }, [draft, steps, ev, actions, step]);

  const goTo = useCallback((i: number) => { setStepState(i); setMaxVisited(m => Math.max(m ?? 0, i)); window.scrollTo({ top: 0 }); }, []);
  const goToKey = useCallback((key: StepKey) => { const i = steps.findIndex(s => s.key === key); if (i >= 0) goTo(i); }, [steps, goTo]);
  const next = () => {
    if (step >= steps.length - 1 || !draft) return;
    // Leaving Requirements: fill every dimension input the planner has not set themselves.
    const base = steps[step].key === 'requirements' ? applyDerived(draft, deriveFromRequirements(draft, template, benchmarks)) : draft;
    persist(step + 1, base); goTo(step + 1);
  };
  const back = () => { if (step > 0) goTo(step - 1); };
  const saveExit = () => { persist(); message.success('Draft saved'); navigate('/planning'); };
  const submit = () => {
    const rec = persist();
    const bad = blockers(rec, ev, template).filter(b => b.level === 'bad');
    if (bad.length) { message.warning(`${bad.length} item${bad.length === 1 ? '' : 's'} block submission; see the checklist.`); return; }
    actions.submitForReview(rec);
    message.success('Plan submitted for review');
    navigate(`/planning/plans/${rec.id}`);
  };

  if (!draft) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;
  const cur = steps[step];
  const isLast = step === steps.length - 1;
  const bad = isLast ? blockers(draft, ev, template).filter(b => b.level === 'bad').length : 0;
  const stepProps: StepProps = { draft, template, why, patch, setParam, resetParam, ev, templates, benchmarks, estate, actuals, actions, data, persist: () => persist(), saved, goTo: goToKey };
  const dimUse = cur.key.startsWith('dim:') ? dimensionsFor(template).find(d => `dim:${d.dim.key}` === cur.key) : undefined;
  const canNext = !(cur.key === 'type' && !draft.templateId);

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <DetailPageHeader backTo="/planning" backLabel="Planner" code={draft.plnId} name={draft.title || (planId ? 'Edit plan' : 'New plan')}
        subtitle={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{template && <ScopeChip scope={draft.scope} />}<span>{template ? template.name : 'Choose a plan type'} · step {step + 1} of {steps.length}</span></span>}
        statusPill={<StatusChip status={draft.status} />} actions={[{ key: 'save', label: 'Save and exit', icon: <SaveOutlined />, onClick: saveExit }]} />
      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) 260px', gap: 'var(--vw-space-md)', alignItems: 'start' }}>
        <div className="vw-card-section" style={{ padding: 10, position: 'sticky', top: 12 }}>
          <WizardNav steps={steps} current={step} maxVisited={maxVisited} onPick={goTo} />
        </div>
        <div className="vw-card-section" style={{ padding: 'var(--vw-space-lg)', minWidth: 0 }}>
          {cur.key === 'type' && <PlanTypeStep {...stepProps} />}
          {cur.key === 'requirements' && <RequirementsStep {...stepProps} />}
          {dimUse && <DimensionStep key={cur.key} {...stepProps} dim={dimUse.dim} depth={dimUse.depth} />}
          {cur.key.startsWith('dim:') && !dimUse && <div className="vw-card-description">{DIMENSIONS.find(d => `dim:${d.key}` === cur.key)?.label} is not part of this plan type.</div>}
          {cur.key === 'scenarios' && <ScenariosStep {...stepProps} />}
          {cur.key === 'review' && <ReviewStep {...stepProps} />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--vw-color-slate-100)' }}>
            <Button icon={<ArrowLeftOutlined />} onClick={back} disabled={step === 0}>Back</Button>
            <span style={{ display: 'inline-flex', gap: 8 }}>
              <Button onClick={() => { persist(); message.success('Draft saved'); }} disabled={!draft.templateId}>Save draft</Button>
              {!isLast && <Tooltip title={canNext ? undefined : 'Pick a plan type first'}><Button type="primary" onClick={next} disabled={!canNext}>{cur.key === 'requirements' ? 'Fill the design' : 'Next'} <ArrowRightOutlined /></Button></Tooltip>}
              {isLast && <Button type="primary" icon={<SendOutlined />} onClick={submit} disabled={bad > 0}>{bad ? `Submit (${bad} blocking)` : 'Submit for review'}</Button>}
            </span>
          </div>
        </div>
        <div style={{ position: 'sticky', top: 12 }}><LiveEstimateRail draft={draft} ev={ev} /></div>
      </div>
    </div>
  );
}
