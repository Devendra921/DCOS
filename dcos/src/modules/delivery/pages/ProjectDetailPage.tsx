import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
/* Project detail — /delivery/projects/:projectId. Where the project sits in the chain (plan →
   programme → project), a summary row, and every tab visible: overview, its BPMN process, work
   orders by process step, changes, schedule, cost, procurement and materials, commissioning and
   handover, risks, tickets, documents and activity. Reads through useDeliveryData + chainOfProject; changes work
   orders and changes only through useChainActions, and process tasks through useEngineActions. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Spin } from 'antd';
import type * as T from '../../../mock/data/types';
import { ArrowRightLeft, ClipboardList, FolderOpen, GitBranch, Play, Plus, Workflow } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, KV, Panel, Tabs } from '../../../ops/ui/kit';
import { SoftMeter, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { useRecords } from '../components/project/useRecords';
import { chainOfProject, isOpenChange, isOpenWorkOrder, useDeliveryData } from '../lib/chain';
import { useDeliverySnapshot, useDeliverSpine } from '../lib/deliverExec';
import { linesOfProject } from '../lib/materialRules';
import { useMaterialData } from '../lib/materialHooks';
import { useProjectCost } from '../lib/cost';
import { useAllTickets, isOpenTicket } from '../lib/tickets';
import { describeInstance, elementName, processName, processPid, useEngineActions, useEngineIncidents, useParsedProcess } from '../../workorders/lib/useWorkflows';
import ProjectCostTab from '../components/ProjectCostTab';
import { AtpPanel, HotoPanel } from '../components/commissioning';
import { TicketPanel } from '../components/TicketPanel';
import { ChainTrail, ToneChip } from '../components/project/kit';
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
  const mat = useMaterialData();
  const [raising, setRaising] = useState<{ stepId?: string } | null>(null);

  const woRows = useMemo(() => (chain ? workOrderRows(d, chain.workOrders) : []), [d, chain]);
  const chRows = useMemo(() => (chain ? changeRows(d, chain.changes) : []), [d, chain]);
  const poRows: PoRow[] = useMemo(() => {
    if (!chain) return [];
    const seen = new Map<string, T.PurchaseOrder>();
    for (const p of [...snap.pos, ...chain.purchaseOrders]) seen.set(p.id, p);
    // Orders the project's material lines are bought on (ERP order lines), wherever they were raised.
    const polIds = new Set(linesOfProject(mat, chain.project.id).map((l) => l.poLineId).filter(Boolean));
    const poIds = new Set(mat.purchaseOrderLines.filter((l) => polIds.has(l.id)).map((l) => l.poId));
    for (const p of d.purchaseOrders) if (poIds.has(p.id)) seen.set(p.id, p);
    return [...seen.values()].map((po) => ({ po, bom: allBoms.find((b) => b.id === po.bomId), vendor: d.vendors.find((v) => v.id === po.vendorId) }))
      .sort((a, b) => (a.po.needBy ?? '').localeCompare(b.po.needBy ?? ''));
  }, [chain, snap.pos, allBoms, d.vendors, d.purchaseOrders, mat]);
  const procInc = useMemo(() => incidents.filter((e) => e.instanceId === chain?.process?.id), [incidents, chain?.process?.id]);
  const blockers = useMemo(() => (chain ? projectBlockers(chain, snap.snags, procInc) : []), [chain, snap.snags, procInc]);

  if (!chain || !project) {
    if (!d.ready) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;
    return (
      <PageEmptyState title="Project not found" description={<>No project with id {projectId}. <Link to="/delivery/projects">Back to the projects</Link>.</>} />
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

  const tabItems: { key: string; label: string; badge?: number; children: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', children: <ProjectOverviewTab chain={chain} stage={stage} waitingOn={waitingOn} blockers={blockers} onTab={setTab} /> },
    { key: 'process', label: 'Process', badge: chain.openTasks.length || undefined, children: <ProjectProcessTab chain={chain} onShowWorkOrders={() => setTab('workorders')} onShowMaterials={() => setTab('procurement')} /> },
    { key: 'workorders', label: 'Work orders', badge: openWos.length || undefined, children: (
      <Panel title="Work orders" icon={ClipboardList} count={chain.workOrders.length} sub={`${chain.workOrders.length} in total, ${openWos.length} open`}
        actions={<Btn variant="filled" icon={Plus} onClick={() => setRaising({})}>Raise work order</Btn>}>
        <div className="col" style={{ gap: 8 }}>
          <div className="vw-card-description">Work orders are grouped by the process step that raised them. Each one has its own change request; the work can start once that change is approved.</div>
          <WorkOrdersTable rows={woRows} groupByStep={woRows.some((r) => r.wo.projectStepId) ? stepName : undefined}
            empty={process ? 'No work orders yet. Raise one for a process step that touches the estate.' : 'No work orders yet. Start the process, or raise a work order directly.'} />
        </div>
      </Panel>
    ) },
    { key: 'changes', label: 'Changes', badge: openChanges.length || undefined, children: (
      <Panel title="Changes" icon={ArrowRightLeft} count={chain.changes.length} sub={`${chain.changes.length} in total, ${openChanges.length} open, ${awaitingApproval} awaiting approval`}>
        <div className="col" style={{ gap: 8 }}>
          <div className="vw-card-description">Every change to the estate goes through a change request, one per work order. Standard changes use a pre-approved template and need no change board. Normal changes go to the weekly change board. Emergency changes go to the emergency board on demand and are reviewed afterwards.</div>
          <ChangesTable rows={chRows} empty="No changes yet. Raising a work order raises its change." />
        </div>
      </Panel>
    ) },
    { key: 'schedule', label: 'Schedule', children: <ProjectScheduleTab project={project} tasks={chain.tasks} milestones={chain.milestones} /> },
    { key: 'cost', label: cost && cost.variance < 0 ? 'Cost · over budget' : 'Cost', children: <ProjectCostTab project={project} /> },
    { key: 'procurement', label: 'Procurement and materials', badge: poRows.length || undefined, children: <ProjectProcurementTab project={project} rows={poRows} boms={snap.boms} canGenerate={snap.boms.length === 0 && project.status !== 'Completed'} onGenerate={() => run('Procurement', () => spine.generateProcurement(project))} /> },
    { key: 'commissioning', label: 'Commissioning', children: (
      <div className="col" style={{ gap: 16 }}>
        <AtpPanel project={project} onGenerate={() => run('Acceptance tests', () => spine.generateAtpPack(project))} />
        <HotoPanel project={project} hoto={snap.hoto} onOpen={() => run('Handover package', () => spine.openHoto(project))} />
      </div>
    ) },
    { key: 'risks', label: 'Risks', badge: chain.risks.filter((r) => r.status === 'Open').length || undefined, children: <Panel title="Risks" count={chain.risks.length}><RisksTable risks={chain.risks} /></Panel> },
    { key: 'tickets', label: 'Tickets', badge: projectTickets.filter(isOpenTicket).length || undefined, children: <Panel><TicketPanel anchor={{ projectId: project.id }} title="Project tickets" dataCenterId={project.dataCenterId} /></Panel> },
    { key: 'documents', label: 'Documents', children: <ProjectDocumentsTab project={project} permits={chain.permits} designDocs={snap.designDocs} /> },
    { key: 'activity', label: 'Activity', children: <ProjectActivityTab project={project} /> },
  ];
  const active = tabItems.find((t) => t.key === tab) ?? tabItems[0];
  const spentPct = budget ? Math.round((spent / budget) * 100) : 0;

  return (
    <OpsPage
      title={project.name}
      description={[project.projId, project.template, site ? `${site.name} (${site.code})` : undefined, `managed by ${project.managerName}`].filter(Boolean).join(' · ')}
      actions={<>
        <ToneChip v={PROJECT_STATUS_TONE[project.status] ?? 'neutral'}>{project.status}</ToneChip>
        <ToneChip v={RAG_TONE[project.rag] ?? 'neutral'}>RAG {project.rag}</ToneChip>
        {plan && <Btn icon={FolderOpen} onClick={() => navigate(`/planning/plans/${plan.id}`)}>Open plan</Btn>}
        {program && <Btn icon={FolderOpen} onClick={() => navigate(`/delivery/programs/${program.id}`)}>Open programme</Btn>}
        {process && <Btn icon={Workflow} onClick={() => navigate(`/workorders/instances/${process.id}`)}>Open in process console</Btn>}
        {!process && procKey && <Btn icon={Play} onClick={() => void startProcess()}>Start process</Btn>}
        <Btn variant="filled" icon={Plus} title="Creates a work order and its change request" onClick={() => setRaising({})}>Raise work order</Btn>
      </>}>

      <StatGrid>
        <StatTile label="Completion" value={pct(project.percentComplete)} sub={ms.length ? `${msDone} of ${ms.length} milestones done` : 'no milestones'}>
          <SoftMeter pct={project.percentComplete} tone="info" />
        </StatTile>
        <StatTile label="Current stage" value={<span title={stage}>{stage}</span>} sub={process ? `waiting on ${waitingOn}` : 'no process running'} />
        <StatTile label="Next gate" value={<span title={nextGate?.name}>{nextGate?.name ?? 'None open'}</span>} sub={nextGate ? `${fmtDate(nextGate.dueDate)}, ${gateDays < 0 ? `${-gateDays} days late` : `in ${gateDays} days`}` : undefined} subTone={nextGate && gateDays < 0 ? 'bad' : undefined} />
        <StatTile label="Open work orders" value={openWos.length} sub={`${chain.workOrders.filter((w) => w.status === 'Awaiting change approval').length} awaiting change approval`} />
        <StatTile label="Open changes" value={openChanges.length} sub={`${awaitingApproval} awaiting approval`} />
        <StatTile label="Spend" value={money(spent)} sub={`of ${money(budget)} budget (${spentPct}%)`} subTone={spent > budget ? 'bad' : undefined}>
          <SoftMeter pct={spentPct} tone={spent > budget ? 'error' : 'info'} />
        </StatTile>
      </StatGrid>

      <Panel title="Delivery chain" icon={GitBranch} sub={<ChainTrail steps={[
        { label: 'Plan', code: plan?.plnId, to: plan ? `/planning/plans/${plan.id}` : undefined },
        { label: 'Programme', code: program?.progId, to: program ? `/delivery/programs/${program.id}` : undefined },
        { label: 'Project', code: project.projId, current: true },
        { label: 'Work orders', code: String(chain.workOrders.length), to: '?tab=workorders' },
        { label: 'Changes', code: String(chain.changes.length), to: '?tab=changes' },
      ]} />}>
        <KV cols={5} items={[
          ['Template', project.template ?? '—'],
          ['Manager', project.managerName],
          ['Site', site ? `${site.name} (${site.code})` : '—'],
          ['Dates', `${shortDate(project.plannedStart)} to ${shortDate(project.plannedEnd)}`],
          ['Process', process ? `${processPid(process.definitionKey)} ${processName(process.definitionKey)}` : 'Not started'],
        ]} />
      </Panel>

      {/* Every tab is shown; nothing hides behind a "More" menu. */}
      <Tabs tabs={tabItems.map((t) => ({ id: t.key, label: t.label, count: t.badge }))} value={active.key} onChange={setTab} />
      <div key={active.key} className="col" style={{ gap: 16 }}>{active.children}</div>

      {raising && <RaiseWorkOrderDrawer open onClose={() => setRaising(null)} d={d} project={project} program={program} plan={plan} process={process} defaultStepId={raising.stepId ?? process?.currentElementIds[0]} />}
    </OpsPage>
  );
}
