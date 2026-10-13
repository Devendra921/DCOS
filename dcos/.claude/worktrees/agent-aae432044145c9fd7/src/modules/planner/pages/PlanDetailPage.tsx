/* Plan detail — /planning/plans/:planId. Header, hero figures for the evaluation on show, and ten tabs. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Spin } from 'antd';
import { dcTypeProfile } from '../../../mock/data/dcTypes';
import { DetailPageHeader, TabBarV2, VwCard, VwChip, fmtDate, type DetailHeaderAction } from '../../../shared/components/ux';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { EditOutlined, SendOutlined, AuditOutlined, RocketOutlined, ExperimentOutlined, ProjectOutlined, LinkOutlined } from '../../../shared/icons';
import { ProcessPanel } from '../../workorders/components/ProcessPanel';
import { fmtKw, SCOPE_LABEL } from '../lib/engine';
import { uiFor } from '../components/scopes/registry';
import { useEstate, useFeedback, usePlan, usePlanEvaluation, usePlannerActions, useSourcingContext } from '../lib/usePlanner';
import { StatusChip } from '../components/kit';
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
import { CopilotTab } from '../components/detail/CopilotTab';
import { ApprovalModal } from '../components/detail/ApprovalModal';
import { PlanPack } from '../components/outputs/PlanPack';
import { sourcingReady } from '../components/outputs/packModel';

const TABS = ['overview', 'pack', 'sizing', 'capacity', 'cost', 'scenarios', 'schedule', 'rules', 'risks', 'copilot'] as const;
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
  const [executed, setExecuted] = useState<{ programId?: string; instanceId?: string } | null>(null);

  const scopeTabs = plan ? uiFor(plan.scope).detailTabs ?? [] : [];
  const tab: TabKey = [...TABS, ...scopeTabs.map(t => t.key)].includes(params.get('tab') ?? '') ? (params.get('tab') as TabKey) : 'overview';
  const setTab = (k: string) => { const next = new URLSearchParams(params); if (k === 'overview') next.delete('tab'); else next.set('tab', k); setParams(next, { replace: true }); };

  const effectiveKey = useMemo(() => {
    const want = viewKey ?? plan?.preferredScenarioId ?? 'base';
    return want !== 'base' && !evaluation.scenarios.some(s => s.scenario.id === want) ? 'base' : want;
  }, [viewKey, plan?.preferredScenarioId, evaluation.scenarios]);

  const view: PlanView | null = useMemo(() => {
    if (!plan || !evaluation.base) return null;
    const sel = effectiveKey === 'base' ? null : evaluation.scenarios.find(s => s.scenario.id === effectiveKey) ?? null;
    return { plan, ev: sel?.ev ?? evaluation.base, base: evaluation.base, scenarios: evaluation.scenarios, viewScenario: sel?.scenario ?? null, actuals: evaluation.actuals, templates: evaluation.templates, benchmarks: evaluation.benchmarks, estate, feedback, actions };
  }, [plan, evaluation, effectiveKey, estate, feedback, actions]);

  if (!plan) {
    return <div className="vw-flex vw-flex-col vw-page-gap"><DetailPageHeader backTo="/planning/plans" backLabel="Plans" name="Plan not found" sticky={false} /><VwCard><div className="vw-card-description">No plan with id {planId}. <Link to="/planning/plans">Back to the plan list</Link>.</div></VwCard></div>;
  }
  if (!view) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;

  const { ev } = view;
  const profile = dcTypeProfile(plan.dcTypeKey);
  const site = estate.dataCenters.find(d => d.id === plan.dataCenterId);
  const campus = estate.campuses.find(c => c.id === plan.campusId);
  const siteLabel = site ? `${site.name} (${site.code})` : plan.newSiteName ? `${plan.newSiteName}${campus ? ` · ${campus.name}` : ''}` : campus?.name ?? '—';
  const programId = plan.programId ?? executed?.programId;
  const instanceId = plan.processInstanceId ?? executed?.instanceId;
  const pendingSteps = plan.approvals.filter(a => a.decision === 'Pending').length;

  const execute = async () => {
    setExecuting(true);
    try {
      const res = await actions.execute(plan, ev, sourcing, evaluation.data);
      const a = res.artefacts;
      setExecuted({ programId: a.programId, instanceId: a.processInstanceId });
      if (!res.ok) { message.error(`Execution stopped at ${res.errors.map(e => e.step).join(', ')}: ${res.errors.map(e => e.message).join('; ')}. Fix the cause and start again; finished steps are not repeated.`); return; }
      for (const w of res.warnings) message.warning(w);
      message.success(`${a.programId ? 'Programme' : 'Change request'}, work order, bill of materials (${a.purchaseOrderIds.length} purchase orders)${a.reservedDeviceIds?.length ? `, ${a.reservedDeviceIds.length} stock devices reserved` : ''}${a.reservedRackIds?.length ? `, ${a.reservedRackIds.length} rack positions reserved` : ''}${a.subnetIds.length ? `, ${a.subnetIds.length} reserved subnets` : ''}${a.permitIds.length ? `, ${a.permitIds.length} permits` : ''} and ${a.designDocIds.length} design documents created`);
      setTab('pack');
    } catch (e) { message.error((e as Error).message); } finally { setExecuting(false); }
  };
  const cloneAsScenario = () => {
    const src = view.viewScenario;
    const rec = actions.createScenario(plan.id, src ? `${src.name} (copy)` : `Scenario ${String.fromCharCode(65 + view.scenarios.length)}`, src ? src.description : 'Copy of the base case; change the overrides to explore an alternative.', { ...(src?.overrides ?? {}) });
    setViewKey(rec.id); setTab('scenarios'); message.success(`Scenario ${rec.name} created`);
  };

  const headerActions: DetailHeaderAction[] = [
    { key: 'submit', label: 'Submit for review', icon: <SendOutlined />, primary: plan.status === 'Draft', hidden: plan.status !== 'Draft' && plan.status !== 'Rejected', disabled: ev.hardFails > 0, tooltip: ev.hardFails > 0 ? `${ev.hardFails} hard rule(s) fail — fix them before submitting` : 'Starts the approval path from the template', onClick: () => { actions.submitForReview(plan); message.success('Submitted for review'); } },
    { key: 'decide', label: pendingSteps ? `Approve / reject (${pendingSteps} pending)` : 'Approvals', icon: <AuditOutlined />, primary: plan.status === 'In review', hidden: plan.status !== 'In review', onClick: () => setApproving(true) },
    { key: 'execute', label: executing ? 'Creating…' : 'Start the build', icon: <RocketOutlined />, primary: plan.status === 'Approved', hidden: plan.status !== 'Approved', disabled: executing || !sourcingReady(sourcingCtx), tooltip: !sourcingReady(sourcingCtx) ? 'Loading stock and vendor data…' : `Programme budget ${fmtKw(ev.sizing.itKw)} at CapEx from the ${view.viewScenario ? `scenario ${view.viewScenario.name}` : 'base case'}`, onClick: () => void execute() },
    { key: 'programme', label: 'Open programme', icon: <ProjectOutlined />, primary: (plan.status === 'Executing' || plan.status === 'Completed') && !!programId, hidden: !programId || !(plan.status === 'Executing' || plan.status === 'Completed'), onClick: () => navigate(`/delivery/programs/${programId}`) },
    { key: 'edit', label: 'Edit in wizard', icon: <EditOutlined />, onClick: () => navigate(`/planning/plans/${plan.id}/edit`) },
    { key: 'clone', label: 'Clone as scenario base', icon: <ExperimentOutlined />, onClick: cloneAsScenario },
  ];

  const tabItems = [
    { key: 'overview', label: 'Overview', children: <OverviewTab v={view} /> },
    { key: 'pack', label: 'Plan pack', children: <PlanPack plan={plan} ev={ev} template={ev.resolved?.template ?? view.templates.find(t => t.id === plan.templateId)} benchmarks={view.benchmarks} siteName={site?.name ?? plan.newSiteName ?? campus?.name ?? 'New site'} sourcing={sourcing} /> },
    ...scopeTabs.map(t => { const vp = { plan, ev, data: evaluation.data, template: ev.resolved?.template, benchmarks: view.benchmarks }; return { key: t.key, label: t.label, badge: t.badge?.(vp), children: tab === t.key ? t.render(vp) : null }; }),
    { key: 'sizing', label: 'Sizing', children: <SizingTab v={view} /> },
    { key: 'capacity', label: 'Capacity', badge: ev.bindingConstraint !== 'none' ? ev.bindingConstraint : undefined, children: <CapacityTab v={view} /> },
    { key: 'cost', label: 'Cost', children: <CostTab v={view} /> },
    { key: 'scenarios', label: 'Scenarios', badge: view.scenarios.length, children: <ScenariosTab v={view} /> },
    { key: 'schedule', label: 'Schedule', badge: ev.schedule.filter(s => s.late).length || undefined, children: <ScheduleTab v={view} /> },
    { key: 'rules', label: 'Rules', badge: ev.hardFails + ev.softWarns || undefined, children: <RulesTab v={view} /> },
    { key: 'risks', label: 'Risks', badge: plan.risks.length || undefined, children: <RisksTab v={view} /> },
    { key: 'copilot', label: 'Copilot', children: <CopilotTab v={view} /> },
  ];

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <DetailPageHeader
        backTo="/planning/plans" backLabel="Plans"
        code={plan.plnId} name={plan.title}
        statusPill={<span className="vw-inline-flex vw-items-center vw-gap-xs"><StatusChip status={plan.status} />{plan.aiAssisted && <VwChip variant="purple">AI assisted</VwChip>}</span>}
        subtitle={<span>Template <strong>{ev.resolved?.template.name ?? plan.templateId}</strong>{ev.resolved ? ` v${ev.resolved.template.version}` : ''} · requested by {plan.requestedBy} · updated {fmtDate(plan.updatedAt)}</span>}
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

      {(executed || ((plan.status === 'Executing' || plan.status === 'Completed') && (programId || instanceId))) && (
        <VwCard tone="success" title={executed ? 'Programme and work order created' : 'In delivery'}>
          <div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
            {programId ? <Link to={`/delivery/programs/${programId}`} className="nst-btn nst-btn--action nst-btn--sm"><ProjectOutlined /> Programme {programId}</Link> : <span className="vw-card-description">No programme was built for this scope.</span>}
            {instanceId ? <Link to={`/workorders/instances/${instanceId}`} className="nst-btn nst-btn--action nst-btn--sm"><LinkOutlined /> Work order {instanceId}</Link> : <span className="vw-card-description">No work order instance.</span>}
            <span style={{ flex: 1 }} />
            <span className="vw-card-description">Budget {ev.estimate.capexTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} from the {view.viewScenario ? `scenario ${view.viewScenario.name}` : 'base case'}.</span>
          </div>
        </VwCard>
      )}

      <HeroStrip v={view} viewKey={effectiveKey} onView={setViewKey} />

      {(plan.processInstanceId || plan.status === 'Executing' || plan.status === 'Completed') && (
        <ProcessPanel recordType="plannerPlan" recordId={plan.id} businessKey={plan.plnId} title={plan.title} dataCenterId={plan.dataCenterId} height={260} />
      )}

      <TabBarV2 items={tabItems} activeKey={tab} onChange={setTab} primaryCap={7} defaultOverflowKey="copilot"
        tabBarExtraContent={tab !== 'copilot' ? <Button size="small" type="text" onClick={() => setTab('copilot')}>Ask the copilot</Button> : undefined} />

      <ApprovalModal plan={plan} actions={actions} open={approving} onClose={changed => { setApproving(false); if (changed) message.success('Decision recorded'); }} />
    </div>
  );
}
