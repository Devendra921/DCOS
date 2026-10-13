/* Plan wizard. The plan type (template) fixes the wizard: Plan type → Requirements → one step per
   dimension the template requires → Scenarios → Review. Requirements fill the dimension inputs
   (marked "From your requirements"); every input lives on exactly one step.
   New plans start at /planning/new (optional ?intent=, ?scope=, ?template=); /planning/plans/:planId/edit resumes.

   Saving: only the fields the wizard owns are written, and only when nobody changed the plan since
   it was opened. A new plan is created on the first explicit save or when leaving Requirements.
   The wizard is read-only unless the plan is Draft or Rejected. Leaving with unsaved changes asks
   first. Each step is validated before Next. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Modal, Spin, Tooltip } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { DetailPageHeader, VwCard } from '../../../shared/components/ux';
import { ArrowLeftOutlined, ArrowRightOutlined, SaveOutlined, SendOutlined } from '../../../shared/icons';
import type * as T from '../../../mock/data/types';
import { evaluate, type ParamValue } from '../lib/engine';
import { DIMENSIONS, applyDerived, deriveFromRequirements, dimensionsFor } from '../lib/dimensions';
import { newPlanDraft, useActuals, useBenchmarks, useDraftEvaluation, useEstate, usePlan, usePlannerActions, useScenarios, useTemplates } from '../lib/usePlanner';
import * as G from '../lib/governance';
import { StatusChip, ScopeChip } from '../components/kit';
import { usePlannerData } from '../lib/plannerData';
import { blockers, ensureSinglePhase, stepIssues, stepsFor, type StepKey, type StepProps } from '../components/wizard/wizardModel';
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
  const [nowMs] = useState(() => Date.now());

  const [local, setLocal] = useState<T.PlannerPlan | null>(() => (planId ? null : newPlanDraft({ intent: sp.get('intent') ?? '', title: sp.get('title') ?? '', ...(sp.get('scope') ? { scope: sp.get('scope') as T.PlannerScope } : {}), ...(sp.get('template') ? { templateId: sp.get('template')! } : {}) }, { id: actions.actorId, name: actions.actor })));
  // The record as it was loaded (or last saved): the base of the concurrency check and of "unsaved changes".
  const [base, setBase] = useState<T.PlannerPlan | undefined>(undefined);
  // Adopt the stored version when it changes and there are no unsaved edits (e.g. after a withdrawal).
  if (planId && existing && (!base || (!local && existing.updatedAt !== base.updatedAt))) setBase(existing);
  const draft = local ?? existing;
  const saved = !!base;
  const readOnly = !!existing && !G.isEditable(existing);
  const template = useMemo(() => templates.find(t => t.id === draft?.templateId), [templates, draft?.templateId]);
  const steps = useMemo(() => stepsFor(template), [template]);
  const resumeIndex = existing ? Math.max(0, existing.wizardStepKey ? steps.findIndex(s => s.key === existing.wizardStepKey) : (existing.wizardStep ?? 1) - 1) : 0;
  const [stepState, setStepState] = useState<number | null>(planId ? null : 0);
  const step = Math.min(steps.length - 1, Math.max(0, stepState ?? resumeIndex));
  const [maxVisitedState, setMaxVisited] = useState<number | null>(planId ? null : 0);
  const maxVisited = Math.max(step, maxVisitedState ?? (planId ? steps.length - 1 : step));

  const actuals = useActuals(draft?.dcTypeKey);
  const ev = useDraftEvaluation(draft);
  const scenarios = useScenarios(draft?.id);
  const why = useMemo(() => (draft ? Object.fromEntries(deriveFromRequirements(draft, template, benchmarks).map(d => [d.key, d.why])) : {}), [draft, template, benchmarks]);
  const dirty = !readOnly && !!local && (base ? Object.keys(G.wizardPatch(base, local)).length > 0 : !!local.templateId);

  const patch = useCallback((p: Partial<T.PlannerPlan>) => setLocal(d => ({ ...(d ?? existing!), ...p })), [existing]);
  const setParam = useCallback((key: string, value: ParamValue, source: T.PlannerParamSource = 'user') => setLocal(d => { const b = d ?? existing!; return { ...b, params: { ...b.params, [key]: value }, paramSources: { ...b.paramSources, [key]: source } }; }), [existing]);
  const resetParam = useCallback((key: string) => setLocal(d => { const b = d ?? existing!; const params = { ...b.params }; const sources = { ...b.paramSources }; delete params[key]; delete sources[key]; return { ...b, params, paramSources: sources }; }), [existing]);

  /** Save the wizard-owned fields. Returns the saved record, or undefined when the save was refused (conflict, locked, missing name). */
  const persist = useCallback((at?: number, from?: T.PlannerPlan): T.PlannerPlan | undefined => {
    const cur = from ?? draft!;
    if (readOnly) return undefined;
    const ownsPhases = steps.some(s => s.key === 'dim:delivery' || s.key === 'dim:migration') && !['rack', 'pod', 'plant', 'network'].includes(cur.scope);
    const phases = !ownsPhases || cur.phases.length === 0 ? ensureSinglePhase(cur, ev) : cur.phases;
    const idx = at ?? step;
    const res = actions.saveWizard(base, { ...cur, phases, wizardStep: idx + 1, wizardStepKey: steps[idx]?.key });
    if (!res.ok || !res.value) return undefined;
    setLocal(res.value); setBase(res.value);
    return res.value;
  }, [draft, readOnly, steps, ev, actions, step, base]);

  // Unsaved-changes guard: route changes inside the app and closing the tab.
  const skipGuard = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !skipGuard.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    Modal.confirm({ title: 'Leave without saving?', content: 'Your changes to this plan have not been saved.', okText: 'Leave', okButtonProps: { danger: true }, cancelText: 'Stay', onOk: () => blocker.proceed(), onCancel: () => blocker.reset() });
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  const leave = (to: string) => { skipGuard.current = true; navigate(to); };

  // An existing plan has been through every step, so moving back must not lock the later steps.
  const goTo = useCallback((i: number) => { setStepState(i); setMaxVisited(m => Math.max(m ?? (planId ? steps.length - 1 : 0), i)); window.scrollTo({ top: 0 }); }, [planId, steps.length]);
  const goToKey = useCallback((key: StepKey) => { const i = steps.findIndex(s => s.key === key); if (i >= 0) goTo(i); }, [steps, goTo]);

  if (!draft) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;
  const cur = steps[step];
  const isLast = step === steps.length - 1;
  const issues = readOnly ? [] : stepIssues(cur.key, draft, ev, templates, nowMs);
  const bad = isLast ? blockers(draft, ev, template, data).filter(b => b.level === 'bad').length : 0;
  const canSave = !readOnly && !!draft.templateId && !!draft.title.trim();

  const next = () => {
    if (step >= steps.length - 1) return;
    if (readOnly) { goTo(step + 1); return; }
    if (issues.length) { message.warning(issues[0].text); return; }
    // Leaving Requirements: fill every dimension input the planner has not set themselves, and create the plan.
    const from = cur.key === 'requirements' ? applyDerived(draft, deriveFromRequirements(draft, template, benchmarks)) : draft;
    if (cur.key === 'type' && !saved) { if (from !== draft) setLocal(from); goTo(step + 1); return; }
    if (!persist(step + 1, from)) return;
    goTo(step + 1);
  };
  const back = () => { if (step > 0) goTo(step - 1); };
  const saveExit = () => { if (!dirty) { leave('/planning'); return; } if (persist()) { message.success('Draft saved'); leave('/planning'); } };
  const submit = () => {
    const rec = persist(); if (!rec) return;
    const bad2 = blockers(rec, ev, template, data).filter(b => b.level === 'bad');
    if (bad2.length) { message.warning(`${bad2.length} item${bad2.length === 1 ? '' : 's'} block submission; see the checklist.`); return; }
    const scn = scenarios.find(s => s.id === rec.preferredScenarioId) ?? null;
    const reviewEv = scn ? evaluate(rec, scn, templates, benchmarks, actuals, data) : ev!;
    const r = actions.submitForReview(rec, { ev: reviewEv, scenario: scn });
    if (!r.ok) return;
    message.success(`Plan submitted for review. ${r.notes?.[0] ?? ''}`);
    leave(`/planning/plans/${rec.id}`);
  };

  const stepProps: StepProps = { draft, template, why, patch, setParam, resetParam, ev, templates, benchmarks, estate, actuals, actions, data, persist: () => persist() ?? draft, saved, goTo: goToKey, issues, readOnly };
  const dimUse = cur.key.startsWith('dim:') ? dimensionsFor(template).find(d => `dim:${d.dim.key}` === cur.key) : undefined;
  const lock = existing ? G.lockReason(existing) : undefined;

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <DetailPageHeader backTo="/planning" backLabel="Planner" code={draft.plnId} name={draft.title || (planId ? 'Edit plan' : 'New plan')}
        subtitle={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{template && <ScopeChip scope={draft.scope} />}<span>{template ? template.name : 'Choose a plan type'} · step {step + 1} of {steps.length}{draft.revision ? ` · revision ${draft.revision}` : ''}{dirty ? ' · unsaved changes' : ''}</span></span>}
        statusPill={<StatusChip status={draft.status} />}
        actions={readOnly ? [{ key: 'open', label: 'Open plan', onClick: () => leave(`/planning/plans/${draft.id}`) }] : [{ key: 'save', label: 'Save and exit', icon: <SaveOutlined />, disabled: !canSave && dirty, tooltip: canSave ? undefined : 'Pick a plan type and give the plan a name first', onClick: saveExit }]} />
      {readOnly && lock && (
        <VwCard variant="child" tone="info">
          <div className="vw-flex vw-justify-between vw-items-center vw-gap-sm vw-wrap">
            <span className="vw-card-description">{lock} You can look through every step; nothing can be changed here.</span>
            <span className="vw-inline-flex vw-gap-sm">
              {existing?.status === 'In review' && <Button size="small" onClick={() => { if (actions.withdraw(existing, 'Withdrawn from the wizard to make changes').ok) { setLocal(null); message.success('Withdrawn to Draft; you can edit the plan now'); } }}>Withdraw to edit</Button>}
              {(existing?.status === 'Approved' || existing?.status === 'Executing') && !existing.supersededBy && <Button size="small" onClick={() => { const r = actions.raiseRevision(existing); if (r.ok && r.value) leave(`/planning/plans/${r.value.id}/edit`); }}>Raise revision</Button>}
              <Button size="small" type="primary" onClick={() => leave(`/planning/plans/${draft.id}`)}>Open plan</Button>
            </span>
          </div>
        </VwCard>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) 260px', gap: 'var(--vw-space-md)', alignItems: 'start' }}>
        <div className="vw-card-section" style={{ padding: 10, position: 'sticky', top: 12 }}>
          <WizardNav steps={steps} current={step} maxVisited={maxVisited} onPick={goTo} />
        </div>
        <div className="vw-card-section" style={{ padding: 'var(--vw-space-lg)', minWidth: 0 }}>
          <div inert={readOnly} style={readOnly ? { opacity: 0.85 } : undefined}>
            {cur.key === 'type' && <PlanTypeStep {...stepProps} />}
            {cur.key === 'requirements' && <RequirementsStep {...stepProps} />}
            {dimUse && <DimensionStep key={cur.key} {...stepProps} dim={dimUse.dim} depth={dimUse.depth} />}
            {cur.key.startsWith('dim:') && !dimUse && <div className="vw-card-description">{DIMENSIONS.find(d => `dim:${d.key}` === cur.key)?.label} is not part of this plan type.</div>}
            {cur.key === 'scenarios' && <ScenariosStep {...stepProps} />}
            {cur.key === 'review' && <ReviewStep {...stepProps} />}
          </div>
          {issues.length > 0 && cur.key !== 'requirements' && cur.key !== 'type' && (
            <VwCard variant="child" tone="error" style={{ marginTop: 12 }}>
              <div className="vw-flex vw-flex-col vw-gap-xs">{issues.map((i, n) => <span key={n} className="vw-card-description">{i.text}</span>)}</div>
            </VwCard>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--vw-color-slate-100)' }}>
            <Button icon={<ArrowLeftOutlined />} onClick={back} disabled={step === 0}>Back</Button>
            <span style={{ display: 'inline-flex', gap: 8 }}>
              {!readOnly && <Tooltip title={canSave ? undefined : 'Pick a plan type and give the plan a name first'}><Button onClick={() => { if (persist()) message.success('Draft saved'); }} disabled={!canSave}>Save draft</Button></Tooltip>}
              {!isLast && <Tooltip title={issues.length ? issues.map(i => i.text).join(' ') : undefined}><Button type="primary" onClick={next} disabled={issues.length > 0}>{cur.key === 'requirements' && !readOnly ? 'Fill the design' : 'Next'} <ArrowRightOutlined /></Button></Tooltip>}
              {isLast && !readOnly && <Button type="primary" icon={<SendOutlined />} onClick={submit} disabled={bad > 0}>{bad ? `Submit (${bad} blocking)` : draft.status === 'Rejected' ? 'Resubmit for review' : 'Submit for review'}</Button>}
            </span>
          </div>
        </div>
        <div style={{ position: 'sticky', top: 12 }}><LiveEstimateRail draft={draft} ev={ev} /></div>
      </div>
    </div>
  );
}
