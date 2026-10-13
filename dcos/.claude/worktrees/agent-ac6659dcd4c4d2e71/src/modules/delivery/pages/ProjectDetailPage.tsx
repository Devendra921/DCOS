/* Project detail — /delivery/projects/:projectId. Where the project sits in the chain (plan →
   programme → project), a summary row, and every tab visible: overview, its BPMN process, work
   orders by process step, changes, schedule, cost, procurement, commissioning and handover, risks,
   tickets, documents and activity. Reads through useDeliveryData + chainOfProject; changes work
   orders and changes only through useChainActions, and process tasks through useEngineActions. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Spin } from 'antd';
import type * as T from '../../../mock/data/types';
import { DetailPageHeader, VwCard, VwChip, type DetailHeaderAction } from '../../../shared/components/ux';
import { useRecords } from '../components/project/useRecords';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { chainOfProject, isOpenChange, isOpenWorkOrder, useDeliveryData } from '../lib/chain';
import { useDeliverySnapshot, useDeliverSpine } from '../lib/deliverExec';
import { useProjectCost } from '../lib/cost';
import { useAllTickets, isOpenTicket } from '../lib/tickets';
import { describeInstance, elementName, processName, processPid, useEngineActions, useEngineIncidents, useParsedProcess } from '../../workorders/lib/useWorkflows';
import ProjectCostTab from '../components/ProjectCostTab';
import { AtpPanel, HotoPanel } from '../components/commissioning';
import { TicketPanel } from '../components/TicketPanel';
import { AllTabs, ChainTrail, Muted, SummaryRow } from '../components/project/kit';
import { ChangesTable, WorkOrdersTable } from '../components/project/ChainTables';
import { ProjectOverviewTab } from '../components/project/ProjectOverviewTab';
import { ProjectProcessTab } from '../components/project/ProjectProcessTab';
import { RaiseWorkOrderDrawer } from '../components/project/RaiseWorkOrderDrawer';
import { ProjectActivityTab, ProjectDocumentsTab, ProjectProcurementTab, ProjectScheduleTab, RisksTable, type PoRow } from '../components/project/ProjectTabs';
import { PROJECT_STATUS_TONE, RAG_TONE, changeRows, daysFrom, fmtDate, money, pct, processKeyForTemplate, projectBlockers, shortDate, workOrderRows } from '../components/project/format';

const TABS = ['overview', 'process', 'workorders', 'changes', 'schedule', 'cost', 'procurement', 'commissioning', 'risks', 'tickets', 'documents', 'activity'];

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab') ?? '') ? params.get('tab')! : 'overview';
  const setTab = (k: string) => { const next = new URLSearchParams(params); if (k === 'overview') next.delete('tab'); else next.set('tab', k); setParams(next, { replace: true }); };

  const d = useDeliveryData();
  const chain = useMemo(() => (projectId ? chainOfProject(d, projectId) : undefined), [d, projectId]);
  const project = chain?.project ?? null;
  const snap = useDeliverySnapshot(project);
  const spine = useDeliverSpine();
  const cost = useProjectCost(project);
  const tickets = useAllTickets();
  const incidents = useEngineIncidents();
  const engine = useEngineActions();
  const parsed = useParsedProcess(chain?.process?.definitionKey);
  const allBoms = useRecords<T.BOM>('boms', 1000);
  const [raising, setRaising] = useState<{ stepId?: string } | null>(null);

  const woRows = useMemo(() => (chain ? workOrderRows(d, chain.workOrders) : []), [d, chain]);
  const chRows = useMemo(() => (chain ? changeRows(d, chain.changes) : []), [d, chain]);
  const poRows: PoRow[] = useMemo(() => {
    if (!chain) return [];
    const seen = new Map<string, T.PurchaseOrder>();
    for (const p of [...snap.pos, ...chain.purchaseOrders]) seen.set(p.id, p);
    return [...seen.values()].map((po) => ({ po, bom: allBoms.find((b) => b.id === po.bomId), vendor: d.vendors.find((v) => v.id === po.vendorId) }))
      .sort((a, b) => (a.po.needBy ?? '').localeCompare(b.po.needBy ?? ''));
  }, [chain, snap.pos, allBoms, d.vendors]);
  const procInc = useMemo(() => incidents.filter((e) => e.instanceId === chain?.process?.id), [incidents, chain?.process?.id]);
  const blockers = useMemo(() => (chain ? projectBlockers(chain, snap.snags, procInc) : []), [chain, snap.snags, procInc]);

  if (!chain || !project) {
    if (!d.ready) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;
    return (
      <div className="vw-flex vw-flex-col vw-page-gap">
        <DetailPageHeader backTo="/delivery/projects" backLabel="Projects" name="Project not found" sticky={false} />
        <VwCard><div className="vw-card-description">No project with id {projectId}. <Link to="/delivery/projects">Back to the projects</Link>.</div></VwCard>
      </div>
    );
  }

  const { program, plan, process } = chain;
  const site = d.dataCenters.find((x) => x.id === project.dataCenterId);
  const procKey = process?.definitionKey ?? processKeyForTemplate(project.template);
  const sum = process ? describeInstance(process, chain.openTasks) : undefined;
  const stage = sum?.step ?? snap.stage;
  const waitingOn = sum?.waitingOn ?? 'No process is running';
  const ms = [...chain.milestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const msDone = ms.filter((m) => m.status === 'Completed').length;
  const nextGate = ms.find((m) => m.status !== 'Completed');
  const gateDays = nextGate ? daysFrom(nextGate.dueDate) : 0;
  const openWos = chain.workOrders.filter(isOpenWorkOrder);
  const openChanges = chain.changes.filter(isOpenChange);
  const awaitingApproval = chain.changes.filter((c) => ['Draft', 'Submitted', 'UnderReview'].includes(c.status)).length;
  const budget = cost?.approvedBudget ?? project.budget;
  const spent = cost?.actual ?? project.actualSpend;
  const projectTickets = tickets.filter((t) => t.projectId === project.id);
  const stepName = (id: string) => parsed.data?.nodes[id]?.name ?? (process ? elementName(process.definitionKey, id) : id);

  const startProcess = async () => {
    if (!procKey) return;
    try { await engine.startInstance(procKey, project.projId, { recordType: 'project', recordId: project.id, dataCenterId: project.dataCenterId, title: project.name, variables: { budget: project.budget, rag: project.rag } }); message.success(`${processName(procKey)} started`); setTab('process'); }
    catch (e) { message.error((e as Error).message); }
  };
  const run = (label: string, fn: () => Promise<unknown>) => fn().then(() => message.success(`${label} done`)).catch((e: Error) => message.error(e.message));

  const actions: DetailHeaderAction[] = [
    { key: 'raise', label: 'Raise work order', primary: true, onClick: () => setRaising({}), tooltip: 'Creates a work order and its change request' },
    { key: 'start', label: 'Start process', hidden: !!process || !procKey, onClick: () => void startProcess() },
    { key: 'console', label: 'Open in process console', hidden: !process, onClick: () => navigate(`/workorders/instances/${process!.id}`) },
    { key: 'programme', label: 'Open programme', hidden: !program, onClick: () => navigate(`/delivery/programs/${program!.id}`) },
    { key: 'plan', label: 'Open plan', hidden: !plan, onClick: () => navigate(`/planning/plans/${plan!.id}`) },
  ];

  const tabItems = [
    { key: 'overview', label: 'Overview', children: <ProjectOverviewTab chain={chain} stage={stage} waitingOn={waitingOn} blockers={blockers} onTab={setTab} /> },
    { key: 'process', label: 'Process', badge: chain.openTasks.length || undefined, children: tab === 'process' ? <ProjectProcessTab chain={chain} onShowWorkOrders={() => setTab('workorders')} /> : null },
    { key: 'workorders', label: 'Work orders', badge: openWos.length || undefined, children: (
      <VwCard title="Work orders" extra={<span className="vw-inline-flex vw-items-center vw-gap-sm"><Muted>{chain.workOrders.length} in total, {openWos.length} open</Muted><Button size="small" type="primary" onClick={() => setRaising({})}>Raise work order</Button></span>}>
        <div className="vw-flex vw-flex-col vw-gap-sm">
          <div className="vw-card-description">Work orders are grouped by the process step that raised them. Each one has its own change request; the work can start once that change is approved.</div>
          <WorkOrdersTable rows={woRows} groupByStep={woRows.some((r) => r.wo.projectStepId) ? stepName : undefined}
            empty={process ? 'No work orders yet. Raise one for a process step that touches the estate.' : 'No work orders yet. Start the process, or raise a work order directly.'} />
        </div>
      </VwCard>
    ) },
    { key: 'changes', label: 'Changes', badge: openChanges.length || undefined, children: (
      <VwCard title="Changes" extra={<Muted>{chain.changes.length} in total, {openChanges.length} open, {awaitingApproval} awaiting approval</Muted>}>
        <div className="vw-flex vw-flex-col vw-gap-sm">
          <div className="vw-card-description">Every change to the estate goes through a change request, one per work order. Standard changes use a pre-approved template and need no change board. Normal changes go to the weekly change board. Emergency changes go to the emergency board on demand and are reviewed afterwards.</div>
          <ChangesTable rows={chRows} empty="No changes yet. Raising a work order raises its change." />
        </div>
      </VwCard>
    ) },
    { key: 'schedule', label: 'Schedule', children: tab === 'schedule' ? <ProjectScheduleTab project={project} tasks={chain.tasks} milestones={chain.milestones} /> : null },
    { key: 'cost', label: 'Cost', badge: cost && cost.variance < 0 ? '!' : undefined, children: tab === 'cost' ? <ProjectCostTab project={project} /> : null },
    { key: 'procurement', label: 'Procurement', badge: poRows.length || undefined, children: <ProjectProcurementTab rows={poRows} boms={snap.boms} canGenerate={snap.boms.length === 0 && project.status !== 'Completed'} onGenerate={() => run('Procurement', () => spine.generateProcurement(project))} /> },
    { key: 'commissioning', label: 'Commissioning', children: (
      <div className="vw-flex vw-flex-col vw-gap-md">
        <AtpPanel project={project} onGenerate={() => run('Acceptance tests', () => spine.generateAtpPack(project))} />
        <HotoPanel project={project} hoto={snap.hoto} onOpen={() => run('Handover package', () => spine.openHoto(project))} />
      </div>
    ) },
    { key: 'risks', label: 'Risks', badge: chain.risks.filter((r) => r.status === 'Open').length || undefined, children: <VwCard title="Risks" extra={<Muted>{chain.risks.length}</Muted>}><RisksTable risks={chain.risks} /></VwCard> },
    { key: 'tickets', label: 'Tickets', badge: projectTickets.filter(isOpenTicket).length || undefined, children: <VwCard><TicketPanel anchor={{ projectId: project.id }} title="Project tickets" dataCenterId={project.dataCenterId} /></VwCard> },
    { key: 'documents', label: 'Documents', children: <ProjectDocumentsTab project={project} permits={chain.permits} designDocs={snap.designDocs} /> },
    { key: 'activity', label: 'Activity', children: tab === 'activity' ? <ProjectActivityTab project={project} /> : null },
  ];

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <DetailPageHeader
        backTo="/delivery/projects" backLabel="Projects"
        code={project.projId} name={project.name}
        statusPill={<span className="vw-inline-flex vw-items-center vw-gap-xs"><VwChip variant={PROJECT_STATUS_TONE[project.status] ?? 'neutral'}>{project.status}</VwChip><VwChip variant={RAG_TONE[project.rag] ?? 'neutral'}>RAG {project.rag}</VwChip></span>}
        subtitle={<ChainTrail steps={[
          { label: 'Plan', code: plan?.plnId, to: plan ? `/planning/plans/${plan.id}` : undefined },
          { label: 'Programme', code: program?.progId, to: program ? `/delivery/programs/${program.id}` : undefined },
          { label: 'Project', code: project.projId, current: true },
          { label: 'Work orders', code: String(chain.workOrders.length), to: '?tab=workorders' },
          { label: 'Changes', code: String(chain.changes.length), to: '?tab=changes' },
        ]} />}
        properties={[
          { label: 'Template', value: project.template ?? '—' },
          { label: 'Manager', value: project.managerName },
          { label: 'Site', value: site ? `${site.name} (${site.code})` : '—' },
          { label: 'Dates', value: `${shortDate(project.plannedStart)} to ${shortDate(project.plannedEnd)}` },
          { label: 'Process', value: process ? `${processPid(process.definitionKey)} ${processName(process.definitionKey)}` : 'Not started' },
        ]}
        actions={actions}
      />

      <SummaryRow items={[
        { label: 'Completion', value: pct(project.percentComplete), sub: ms.length ? `${msDone} of ${ms.length} milestones done` : 'no milestones' },
        { label: 'Current stage', value: stage, sub: process ? `waiting on ${waitingOn}` : 'no process running' },
        { label: 'Next gate', value: nextGate?.name ?? 'None open', sub: nextGate ? `${fmtDate(nextGate.dueDate)}, ${gateDays < 0 ? `${-gateDays} days late` : `in ${gateDays} days`}` : undefined, tone: nextGate && gateDays < 0 ? 'bad' : undefined },
        { label: 'Open work orders', value: String(openWos.length), sub: `${chain.workOrders.filter((w) => w.status === 'Awaiting change approval').length} awaiting change approval` },
        { label: 'Open changes', value: String(openChanges.length), sub: `${awaitingApproval} awaiting approval` },
        { label: 'Spend', value: money(spent), sub: `of ${money(budget)} budget (${budget ? Math.round((spent / budget) * 100) : 0}%)`, tone: spent > budget ? 'bad' : undefined },
      ]} />

      {/* Every tab is shown; nothing hides behind a "More" menu. */}
      <AllTabs items={tabItems} activeKey={tab} onChange={setTab} />

      {raising && <RaiseWorkOrderDrawer open onClose={() => setRaising(null)} d={d} project={project} program={program} plan={plan} process={process} defaultStepId={raising.stepId ?? process?.currentElementIds[0]} />}
    </div>
  );
}
