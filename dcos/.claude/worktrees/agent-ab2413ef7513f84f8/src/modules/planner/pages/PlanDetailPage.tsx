/* Plan detail — /planning/plans/:planId. Header with the actions the plan's status allows, the
   lifecycle notices (locked, partial execution, conditions, template drift, hold, revision),
   hero figures for the evaluation on show, and the tabs. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Spin } from 'antd';
import { dcTypeProfile } from '../../../mock/data/dcTypes';
import { DetailPageHeader, TabBarV2, VwCard, VwChip, fmtDate, type DetailHeaderAction } from '../../../shared/components/ux';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { EditOutlined, SendOutlined, AuditOutlined, RocketOutlined, ExperimentOutlined, ProjectOutlined, LinkOutlined, EyeOutlined, DeleteOutlined, CheckCircleOutlined } from '../../../shared/icons';
import { ProcessPanel } from '../../workorders/components/ProcessPanel';
import { fmtKw, fmtUsd, SCOPE_LABEL } from '../lib/engine';
import * as G from '../lib/governance';
import { closeoutChecks, closeoutReady } from '../lib/closeout';
import { STEP_LABEL } from '../lib/execute';
import { uiFor } from '../components/scopes/registry';
import { useEstate, useFeedback, usePlan, usePlanEvaluation, usePlannerActions, useSourcingContext } from '../lib/usePlanner';
import { StatusChip } from '../components/kit';
import { blockers } from '../components/wizard/wizardModel';
import type { PlanView } from '../components/detail/shared';
import { HeroStrip } from '../components/detail/HeroStrip';
import { OverviewTab } from '../components/detail/OverviewTab';
import { SizingTab } from '../components/detail/SizingTab';
import { CapacityTab } from '../components/detail/CapacityTab';
import { CostTab } from '../components/detail/CostTab';
import { ScenariosTab } from '../components/detail/ScenariosTab';
import { ScheduleTab } from '../components/detail/ScheduleTab';
import { RulesTab } from '../components/detail/RulesTab';
import { RisksTab } from '../components/detail/RisksTab';
import { HistoryTab } from '../components/detail/HistoryTab';
import { DeliveryTab } from '../components/detail/DeliveryTab';
import { BaselineTab } from '../components/detail/BaselineTab';
import { ApprovalModal } from '../components/detail/ApprovalModal';
import { ReasonModal, type ReasonRequest } from '../components/detail/ReasonModal';
import { PlanPack } from '../components/outputs/PlanPack';
import { sourcingReady } from '../components/outputs/packModel';

const TABS = ['overview', 'pack', 'sizing', 'capacity', 'cost', 'scenarios', 'schedule', 'rules', 'risks', 'delivery', 'baseline', 'history'] as const;
type TabKey = string;

export default function PlanDetailPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const plan = usePlan(planId);
  const evaluation = usePlanEvaluation(plan);
  const estate = useEstate();
  const feedback = useFeedback();
  const actions = usePlannerActions();
  const sourcingCtx = useSourcingContext();
  const sourcing = sourcingReady(sourcingCtx) ? sourcingCtx : undefined;
  const [viewKey, setViewKey] = useState<string | undefined>();
  const [approving, setApproving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [reasonReq, setReasonReq] = useState<ReasonRequest | null>(null);

  const scopeTabs = plan ? uiFor(plan.scope).detailTabs ?? [] : [];
  const tab: TabKey = [...TABS, ...scopeTabs.map(t => t.key)].includes(params.get('tab') ?? '') ? (params.get('tab') as TabKey) : 'overview';
  const setTab = (k: string) => { const next = new URLSearchParams(params); if (k === 'overview') next.delete('tab'); else next.set('tab', k); setParams(next, { replace: true }); };

  const effectiveKey = useMemo(() => {
    const want = viewKey ?? plan?.approvedScenarioId ?? plan?.reviewScenarioId ?? plan?.preferredScenarioId ?? 'base';
    return want !== 'base' && !evaluation.scenarios.some(s => s.scenario.id === want) ? 'base' : want;
  }, [viewKey, plan?.approvedScenarioId, plan?.reviewScenarioId, plan?.preferredScenarioId, evaluation.scenarios]);

  const view: PlanView | null = useMemo(() => {
    if (!plan || !evaluation.base) return null;
    const sel = effectiveKey === 'base' ? null : evaluation.scenarios.find(s => s.scenario.id === effectiveKey) ?? null;
    return { plan, ev: sel?.ev ?? evaluation.base, base: evaluation.base, scenarios: evaluation.scenarios, viewScenario: sel?.scenario ?? null, actuals: evaluation.actuals, templates: evaluation.templates, benchmarks: evaluation.benchmarks, estate, feedback, actions, review: evaluation.review, approved: evaluation.approved };
  }, [plan, evaluation, effectiveKey, estate, feedback, actions]);

  const checks = useMemo(() => (plan && plan.status === 'Executing' ? closeoutChecks(plan, evaluation.data, evaluation.templates.find(t => t.id === plan.templateId)) : []), [plan, evaluation.data, evaluation.templates]);

  if (!plan) {
    return <div className="vw-flex vw-flex-col vw-page-gap"><DetailPageHeader backTo="/planning/plans" backLabel="Plans" name="Plan not found" sticky={false} /><VwCard><div className="vw-card-description">No plan with id {planId}. <Link to="/planning/plans">Back to the plan list</Link>.</div></VwCard></div>;
  }
  if (!view) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;

  const { ev } = view;
  const template = ev.resolved?.template ?? view.templates.find(t => t.id === plan.templateId);
  const profile = dcTypeProfile(plan.dcTypeKey);
  const site = estate.dataCenters.find(d => d.id === plan.dataCenterId);
  const campus = estate.campuses.find(c => c.id === plan.campusId);
  const siteLabel = site ? `${site.name} (${site.code})` : plan.newSiteName ? `${plan.newSiteName}${campus ? ` · ${campus.name}` : ''}` : campus?.name ?? '—';
  const programId = plan.artefacts?.programId ?? plan.programId;
  const instanceId = plan.processInstanceId;
  const next = G.nextPendingStep(plan);
  const editable = G.isEditable(plan);
  const lock = G.lockReason(plan);
  const drift = G.templateDrift(plan, template);
  const blocking = G.openBlockingConditions(plan);
  const partial = plan.status === 'Approved' && !!plan.artefacts?.executionId && !plan.artefacts.completedAt;
  // Submission evaluates the preferred scenario: that is the one approvers are shown.
  const preferred = evaluation.scenarios.find(s => s.scenario.id === plan.preferredScenarioId);
  const submitEv = preferred?.ev ?? evaluation.base!;
  const submitBlockers = blockers(plan, submitEv, template, evaluation.data).filter(b => b.level === 'bad');
  const budget = plan.baseline?.capexTotal ?? evaluation.review?.ev.estimate.capexTotal ?? ev.estimate.capexTotal;
  const budgetFrom = plan.baseline ? `the approved baseline (${plan.baseline.scenarioName ?? 'base case'})` : `the scenario under review (${evaluation.review?.scenario?.name ?? 'base case'}); it is frozen as the baseline when the build starts`;
  const ready = closeoutReady(checks);

  const execute = async () => {
    setExecuting(true);
    try {
      const res = await actions.execute(plan, sourcing, evaluation.data, evaluation.scenarios.map(s => s.scenario));
      const a = res.artefacts;
      for (const w of res.warnings) message.warning(w);
      if (!res.ok) { message.error(`Execution stopped at ${res.errors.map(e => STEP_LABEL[e.step] ?? e.step).join(', ')}: ${res.errors.map(e => e.message).join('; ')}. Finished steps are kept; fix the cause and resume.`); return; }
      message.success(`${a.programId ? `Programme ${a.programId}` : `Change ${a.changeRequestId}`}, bill of materials, ${a.purchaseOrderIds.length} purchase orders${a.reservedDeviceIds?.length ? `, ${a.reservedDeviceIds.length} stock devices held` : ''}${a.subnetIds.length ? `, ${a.subnetIds.length} subnets` : ''}${a.permitIds.length ? `, ${a.permitIds.length} permits` : ''} and ${a.designDocIds.length} design documents created; ${a.reservationIds?.length ?? 0} capacity holds committed`);
      setTab('delivery');
    } catch (e) { message.error((e as Error).message); } finally { setExecuting(false); }
  };
  const cloneAsScenario = () => {
    const src = view.viewScenario;
    const rec = actions.createScenario(plan.id, src ? `${src.name} (copy)` : `Scenario ${String.fromCharCode(65 + view.scenarios.length)}`, src ? src.description : 'Copy of the base case; change the overrides to explore an alternative.', { ...(src?.overrides ?? {}) });
    setViewKey(rec.id); setTab('scenarios'); message.success(`Scenario ${rec.name} created`);
  };
  const ask = (r: ReasonRequest) => setReasonReq(r);
  const submit = () => { const r = actions.submitForReview(plan, { ev: submitEv, scenario: preferred?.scenario ?? null }); if (r.ok) message.success(`Submitted for review. ${r.notes?.[0] ?? ''}`); };
  const raiseRevision = () => { const r = actions.raiseRevision(plan); if (r.ok && r.value) { message.success(`Revision ${r.value.revision} created as a draft`); navigate(`/planning/plans/${r.value.id}/edit`); } };

  const s = plan.status;
  const headerActions: DetailHeaderAction[] = [
    { key: 'submit', label: s === 'Rejected' ? 'Resubmit for review' : 'Submit for review', icon: <SendOutlined />, primary: s === 'Draft' || s === 'Rejected', hidden: !editable, disabled: submitBlockers.length > 0, tooltip: submitBlockers.length ? `${submitBlockers.length} item(s) block submission: ${submitBlockers.slice(0, 2).map(b => b.text).join('; ')}` : `Starts a new approval round on ${preferred ? `scenario ${preferred.scenario.name}` : 'the base case'} (${fmtUsd(submitEv.estimate.capexTotal)})`, onClick: submit },
    { key: 'decide', label: next ? `Decide: ${next.step}` : 'Approvals', icon: <AuditOutlined />, primary: s === 'In review', hidden: s !== 'In review', onClick: () => setApproving(true) },
    { key: 'execute', label: executing ? 'Creating…' : partial ? 'Resume execution' : 'Start the build', icon: <RocketOutlined />, primary: s === 'Approved', hidden: s !== 'Approved' || !!plan.supersededBy, disabled: executing || !sourcingReady(sourcingCtx) || blocking.length > 0, tooltip: !sourcingReady(sourcingCtx) ? 'Loading stock and vendor data…' : blocking.length ? `${blocking.length} approval condition(s) must be closed first` : `Programme budget ${fmtUsd(budget)} from ${budgetFrom}`, onClick: () => void execute() },
    { key: 'complete', label: 'Complete plan', icon: <CheckCircleOutlined />, primary: s === 'Executing', hidden: s !== 'Executing', disabled: !ready, tooltip: ready ? 'Every close-out check is green' : `Not ready: ${checks.filter(c => !c.ok).map(c => c.label).join(', ')}. See the Delivery tab.`, onClick: () => ask({ title: `Complete ${plan.plnId}`, description: 'Records what was delivered (capacity, actual spend, measured draw), sets the phases Live and consumes the capacity holds. Add a note if useful.', okText: 'Complete plan', needsReason: false, onOk: () => { const r = actions.complete(plan, evaluation.data); if (r.ok) message.success('Plan completed'); return r.ok ? undefined : false; } }) },
    { key: 'programme', label: 'Open programme', icon: <ProjectOutlined />, hidden: !programId || !(s === 'Executing' || s === 'Completed'), onClick: () => navigate(`/delivery/programs/${programId}`) },
    { key: 'withdraw', label: 'Withdraw from review', hidden: s !== 'In review', onClick: () => ask({ title: 'Withdraw from review', description: 'The plan goes back to Draft. This round is kept in the history as Withdrawn; submitting again starts a new round.', okText: 'Withdraw', needsReason: true, onOk: r => actions.withdraw(plan, r).ok || false }) },
    { key: 'revision', label: 'Raise revision', icon: <EditOutlined />, hidden: !(s === 'Approved' || s === 'Executing') || !!plan.supersededBy, tooltip: 'Copy this plan as the next revision with its own approval round; this plan and its baseline stay as they are until the revision is approved', onClick: raiseRevision },
    { key: 'edit', label: editable ? 'Edit in wizard' : 'View in wizard', icon: editable ? <EditOutlined /> : <EyeOutlined />, onClick: () => navigate(`/planning/plans/${plan.id}/edit`) },
    { key: 'clone', label: 'Clone as scenario base', icon: <ExperimentOutlined />, hidden: !editable, onClick: cloneAsScenario },
    { key: 'resume', label: 'Resume plan', hidden: s !== 'On hold', primary: s === 'On hold', onClick: () => { if (actions.resume(plan).ok) message.success('Plan resumed'); } },
    { key: 'hold', label: 'Put on hold', hidden: !['In review', 'Approved', 'Executing'].includes(s), onClick: () => ask({ title: 'Put the plan on hold', description: 'Nothing is decided or built while the plan is on hold. Capacity holds stay in place.', okText: 'Put on hold', needsReason: true, onOk: r => actions.hold(plan, r).ok || false }) },
    { key: 'cancel', label: 'Cancel plan', danger: true, hidden: ['Draft', 'Completed', 'Cancelled'].includes(s), onClick: () => ask({ title: `Cancel ${plan.plnId}`, description: `The plan is cancelled and kept read-only. Its capacity holds are released.${programId ? ` Programme ${programId} and its orders must be closed in Delivery.` : ''}`, okText: 'Cancel plan', danger: true, needsReason: true, onOk: r => actions.cancel(plan, r).ok || false }) },
    { key: 'delete', label: 'Delete draft', icon: <DeleteOutlined />, danger: true, hidden: !G.canDelete(plan), onClick: () => ask({ title: `Delete ${plan.plnId}?`, description: 'The draft is removed from the planner. It is kept in the audit trail.', okText: 'Delete', danger: true, needsReason: false, onOk: () => { if (actions.deletePlan(plan).ok) { message.info('Draft deleted'); navigate('/planning/plans'); } } }) },
  ];

  const hasDelivery = !!plan.artefacts?.executionId || s === 'Executing' || s === 'Completed';
  const tabItems = [
    { key: 'overview', label: 'Overview', children: <OverviewTab v={view} /> },
    { key: 'pack', label: 'Plan pack', children: <PlanPack plan={plan} ev={ev} template={template} benchmarks={view.benchmarks} siteName={site?.name ?? plan.newSiteName ?? campus?.name ?? 'New site'} sourcing={sourcing} /> },
    ...(hasDelivery ? [{ key: 'delivery', label: 'Delivery', badge: plan.artefacts?.errors?.length || undefined, children: tab === 'delivery' ? <DeliveryTab v={view} data={evaluation.data} /> : null }] : []),
    ...scopeTabs.map(t => { const vp = { plan, ev, data: evaluation.data, template: ev.resolved?.template, benchmarks: view.benchmarks }; return { key: t.key, label: t.label, badge: t.badge?.(vp), children: tab === t.key ? t.render(vp) : null }; }),
    { key: 'sizing', label: 'Sizing', children: <SizingTab v={view} /> },
    { key: 'capacity', label: 'Capacity', children: <CapacityTab v={view} /> },
    { key: 'cost', label: 'Cost', children: <CostTab v={view} /> },
    { key: 'scenarios', label: 'Scenarios', badge: view.scenarios.length, children: <ScenariosTab v={view} /> },
    { key: 'schedule', label: 'Schedule', badge: ev.schedule.filter(x => x.late).length || undefined, children: <ScheduleTab v={view} /> },
    { key: 'rules', label: 'Rules', badge: ev.hardFails + ev.softWarns || undefined, children: <RulesTab v={view} /> },
    { key: 'risks', label: 'Risks', badge: plan.risks.length || undefined, children: <RisksTab v={view} /> },
    ...(plan.baseline || plan.revisionOf ? [{ key: 'baseline', label: 'Baseline', badge: drift ? '!' : undefined, children: tab === 'baseline' ? <BaselineTab v={view} data={evaluation.data} /> : null }] : []),
    { key: 'history', label: 'History', children: tab === 'history' ? <HistoryTab v={view} /> : null },
  ];

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <DetailPageHeader
        backTo="/planning/plans" backLabel="Plans"
        code={plan.plnId} name={plan.title}
        statusPill={<span className="vw-inline-flex vw-items-center vw-gap-xs"><StatusChip status={plan.status} />{plan.revision && <VwChip variant="neutral">Rev {plan.revision}</VwChip>}{plan.supersededBy && <VwChip variant="neutral">Superseded</VwChip>}</span>}
        subtitle={<span>Template <strong>{template?.name ?? plan.templateId}</strong>{template ? ` v${template.version}` : ''}{plan.templateVersion !== undefined ? ` (approved on v${plan.templateVersion})` : ''} · requested by {plan.requestedBy} · updated {fmtDate(plan.updatedAt)}</span>}
        properties={[
          { label: 'Scope', value: SCOPE_LABEL[plan.scope] },
          { label: 'DC type', value: profile?.name ?? plan.dcTypeKey },
          { label: 'Site', value: siteLabel },
          { label: 'Design power', value: fmtKw(plan.designPowerKw), tone: 'info' },
          { label: 'Target go-live', value: fmtDate(plan.targetGoLive) },
          { label: 'Owner', value: plan.ownerName },
        ]}
        actions={headerActions}
      />

      {lock && <VwCard variant="child" tone={s === 'Cancelled' || s === 'On hold' ? 'warning' : 'info'}><div className="vw-card-description">{lock}{s === 'On hold' && plan.holdReason ? ` Reason: ${plan.holdReason} (${plan.heldBy ?? ''}, ${plan.heldAt ? fmtDate(plan.heldAt) : ''}).` : ''}{s === 'Cancelled' && plan.cancelReason ? ` Reason: ${plan.cancelReason}.` : ''}{plan.supersededBy && <> <Link to={`/planning/plans/${plan.supersededBy}`}>Open {plan.supersededBy}</Link>.</>}</div></VwCard>}
      {plan.revisionOf && <VwCard variant="child" tone="purple"><div className="vw-card-description">Revision {plan.revision} of <Link to={`/planning/plans/${plan.revisionOf}`}>{plan.revisionOf}</Link>. When this revision is approved it supersedes {plan.revisionOf}: its holds are released{s !== 'Executing' ? ' and, if it is in delivery, the delivery records move here' : ''}. The Baseline tab shows what changes.</div></VwCard>}
      {drift && <VwCard variant="child" tone="warning"><div className="vw-card-description">Template changed since approval: v{drift.from} → v{drift.to}. The approved figures stay on v{drift.from}; execution uses the frozen baseline. Raise a revision to adopt the new template.</div></VwCard>}
      {blocking.length > 0 && (s === 'Approved' || s === 'Executing') && <VwCard variant="child" tone="warning"><div className="vw-card-description">{blocking.length} approval condition(s) block the build: {blocking.map(c => `${c.text} (owner ${c.owner}${c.dueDate ? `, due ${c.dueDate.slice(0, 10)}` : ''})`).join('; ')}. Close them with evidence on the Overview tab.</div></VwCard>}
      {partial && (
        <VwCard variant="child" tone="error" title="Execution stopped part-way">
          <div className="vw-flex vw-flex-col vw-gap-xs">
            <div className="vw-flex vw-wrap vw-gap-xs">{Object.entries(plan.artefacts?.steps ?? {}).map(([k, st]) => <VwChip key={k} variant={st === 'done' ? 'success' : st === 'failed' ? 'error' : 'neutral'}>{STEP_LABEL[k] ?? k}: {st}</VwChip>)}</div>
            {(plan.artefacts?.errors ?? []).map((e, i) => <div key={i} className="vw-card-description">{STEP_LABEL[e.step] ?? e.step}: {e.message}</div>)}
            <div className="vw-flex vw-items-center vw-gap-sm"><Button type="primary" icon={<RocketOutlined />} disabled={executing || !sourcingReady(sourcingCtx) || blocking.length > 0} onClick={() => void execute()}>Resume execution</Button><span className="vw-card-description">Steps already done are not repeated. The plan becomes Executing only when every step has succeeded.</span></div>
          </div>
        </VwCard>
      )}
      {(s === 'Executing' || s === 'Completed') && (programId || instanceId) && (
        <VwCard tone="success" title="In delivery">
          <div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
            {programId ? <Link to={`/delivery/programs/${programId}`} className="nst-btn nst-btn--action nst-btn--sm"><ProjectOutlined /> Programme {programId}</Link> : <span className="vw-card-description">No programme was built for this scope.</span>}
            {instanceId ? <Link to={`/workorders/instances/${instanceId}`} className="nst-btn nst-btn--action nst-btn--sm"><LinkOutlined /> Delivery process {instanceId}</Link> : <span className="vw-card-description">{plan.artefacts?.deliveryProcessKey === 'programme' ? 'Delivery runs through the programme and its projects.' : 'No delivery process instance.'}</span>}
            <span style={{ flex: 1 }} />
            <span className="vw-card-description">Budget {fmtUsd(budget)} from {budgetFrom}.</span>
          </div>
        </VwCard>
      )}

      <HeroStrip v={view} viewKey={effectiveKey} onView={setViewKey} />

      {(plan.processInstanceId || s === 'Executing' || s === 'Completed') && (
        <ProcessPanel recordType="plannerPlan" recordId={plan.id} businessKey={plan.plnId} title={plan.title} dataCenterId={plan.dataCenterId} height={260} />
      )}

      {/* Every tab is shown; nothing hides behind a "More" menu. */}
      <TabBarV2 items={tabItems} activeKey={tab} onChange={setTab} primaryCap={tabItems.length + 1} />

      <ApprovalModal v={view} data={evaluation.data} sourcing={sourcing} open={approving} onClose={changed => { setApproving(false); if (changed) message.success('Decision recorded'); }} />
      <ReasonModal req={reasonReq} onClose={() => setReasonReq(null)} />
    </div>
  );
}
