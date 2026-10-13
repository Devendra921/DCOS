import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
/* Work order page — /delivery/work-orders/:workOrderId. Where it sits in the chain
   (plan → programme → project → work order → change), its status, and tabs: Overview,
   Assignment, Change, Execution (with the shared materials workspace, as on the change's Materials
   tab), Process (P10) and History. Writes go
   through the chain actions, the material actions and the process engine only. */
import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App } from 'antd';
import { FolderOpen, GitBranch, ListTodo, Play, UserCog, Workflow } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Empty, KV, Panel, Tabs } from '../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { ToneChip } from '../components/project/kit';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { ProcessPanel } from '../../workorders/components/ProcessPanel';
import { ProcessTasksPanel, type PanelProcess } from '../../workorders/components/ProcessTasksPanel';
import { useEngineActions } from '../../workorders/lib/useWorkflows';
import { useDeliveryData } from '../lib/chain';
import { useChainActions } from '../lib/workflowChain';
import { useMaterialData } from '../lib/materialHooks';
import { availabilityOf, linesOfWorkOrder, readinessOf, requestsOfWorkOrder, retiredOf } from '../lib/materialRules';
import { ChainTrail } from '../components/home/kit';
import { accessRequestOf, accessState, buildWorkOrderRow, CLASS_TONE, fmtWindow, NOT_DONE, p10Of, siteNamer, typeLabel, woStatusLabel, woStatusTone } from '../components/workorders/model';
import { OverviewSection, ChangeSection, HistorySection } from '../components/workorders/Sections';
import { AssignmentSection } from '../components/workorders/AssignmentSection';
import { ExecutionSection } from '../components/workorders/ExecutionSection';
import { MaterialsSection } from '../components/workorders/MaterialsSection';
import { kitStartWarning, materialWarnings } from '../components/workorders/materialsView';
import { checklistFor, stepDone, type WorkOrderView } from '../components/workorders/view';

const TABS = ['overview', 'assignment', 'change', 'execution', 'tasks', 'process', 'history'] as const;

export default function WorkOrderDetailPage() {
  const { workOrderId } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [params, setParams] = useSearchParams();
  const d = useDeliveryData();
  const actions = useChainActions();
  const engine = useEngineActions();
  const md = useMaterialData();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? params.get('tab')! : 'overview';
  const setTab = (k: string) => { const n = new URLSearchParams(params); if (k === 'overview') n.delete('tab'); else n.set('tab', k); setParams(n, { replace: true }); };

  const wo = d.workOrders.find(w => w.id === workOrderId);
  const rackIds = useMemo(() => (wo ? wo.rackIds ?? (wo.rackId ? [wo.rackId] : []) : []), [wo]);
  const deviceIds = useMemo(() => wo?.deviceIds ?? [], [wo]);
  const racks = useEntityList('racks', { pageSize: 500, filters: [{ field: 'id', operator: 'in', value: rackIds }] }).data?.data as { id: string; name: string }[] | undefined;
  const devices = useEntityList('devices', { pageSize: 500, filters: [{ field: 'id', operator: 'in', value: deviceIds }] }).data?.data as { id: string; name: string }[] | undefined;

  const view: WorkOrderView | undefined = useMemo(() => {
    if (!wo) return undefined;
    const row = buildWorkOrderRow(d, wo);
    const access = accessRequestOf(d, wo);
    const materialLines = linesOfWorkOrder(md, wo.id);
    return {
      d, row, p10: p10Of(d, wo), access, accessState: wo.assigneeKind === 'contractor' ? accessState(access) : undefined,
      template: d.standardChangeTemplates.find(t => t.id === (wo.standardTemplateId ?? row.change?.standardTemplateId)),
      approvals: row.change ? d.approvalSteps.filter(a => a.changeRequestId === row.change!.id).sort((a, b) => a.order - b.order) : [],
      site: siteNamer(d),
      rackNames: rackIds.map(id => racks?.find(r => r.id === id)?.name ?? id), deviceNames: deviceIds.map(id => devices?.find(x => x.id === id)?.name ?? id),
      actions,
      materialLines, kit: readinessOf(materialLines),
      returnsSent: requestsOfWorkOrder(md, wo.id).some(r => r.kind === 'Return' || r.kind === 'RMA'),
    };
  }, [d, md, wo, racks, devices, rackIds, deviceIds, actions]);

  // Every process behind this work order: its own (P10), the crew's site access (P12) and its change (P05).
  const taskProcesses = useMemo<PanelProcess[]>(() => {
    if (!view) return [];
    const changeId = view.row.change?.id;
    const p05 = changeId ? d.processInstances.filter(i => i.recordType === 'changeRequest' && i.recordId === changeId && i.definitionKey === 'change').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] : undefined;
    return [
      view.p10 && { inst: view.p10, label: 'Work order process (P10)' },
      view.access && { inst: view.access, label: 'Site access (P12)' },
      p05 && { inst: p05, label: `Change ${view.row.change?.chgId ?? changeId} (P05)` },
    ].filter((x): x is PanelProcess => !!x);
  }, [d.processInstances, view]);
  const openTaskCount = useMemo(() => { const ids = new Set(taskProcesses.map(p => p.inst.id)); return d.userTasks.filter(t => t.state === 'created' && ids.has(t.instanceId)).length; }, [d.userTasks, taskProcesses]);

  if (!d.ready) return <OpsPage title="Work order"><Panel><Empty icon={Workflow} title="Loading work order…" /></Panel></OpsPage>;
  if (!wo || !view) {
    return (
      <PageEmptyState title="Work order not found" description={<>No work order with id {workOrderId}. <Link to="/delivery/work-orders">Back to the work order list</Link>.</>} />
    );
  }

  const { row } = view; const c = row.change;
  const steps = checklistFor(view).steps;
  const ticked = steps.filter(st => stepDone(wo, st, view.returnsSent).done).length;
  const s = wo.status;
  const go = () => { const r = actions.startWork(wo.id); if (r.ok) { message.success('Work started; the change is now in progress'); setTab('execution'); } else message.error(r.reason ?? 'The work cannot start'); };
  const kitWarn = kitStartWarning(view.kit);
  // Materials to look at (kit, availability, retired equipment): advisory, shown as a badge only.
  const matWarn = materialWarnings({ kit: view.kit, availability: availabilityOf(view.materialLines), retired: retiredOf(view.materialLines), lines: view.materialLines, open: NOT_DONE.includes(s) });
  const startWork = () => (kitWarn ? modal.confirm({ title: 'The kit is not all at the site', content: kitWarn, okText: 'Start work anyway', onOk: go }) : go());
  const startP10 = async () => {
    const inst = await engine.startInstance('work-order', wo.woId ?? wo.id, { recordType: 'workOrder', recordId: wo.id, dataCenterId: row.siteId, title: row.title, variables: { workType: wo.type, assignee: wo.assigneeName, changeRequestId: c?.id } });
    message.success(`Work order process ${inst.id} started`);
  };

  const startHidden = !['Ready', 'Assigned', 'Awaiting change approval', 'Draft'].includes(s);
  const assignHidden = !['Draft', 'Awaiting change approval', 'Ready', 'Assigned'].includes(s);

  const items: { key: string; label: string; badge?: number; children: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', children: <OverviewSection v={view} /> },
    { key: 'assignment', label: wo.assigneeKind === 'contractor' && !view.accessState?.approved ? 'Assignment · access needed' : 'Assignment', children: <AssignmentSection key={`${wo.id}-${wo.updatedAt}`} v={view} /> },
    { key: 'change', label: !c ? 'Change · none linked' : 'Change', children: <ChangeSection v={view} /> },
    {
      key: 'execution', label: s === 'InProgress' ? `Execution · ${ticked}/${steps.length}` : matWarn.length ? 'Execution · check materials' : 'Execution',
      children: <div className="col" style={{ gap: 16 }}><ExecutionSection v={view} /><MaterialsSection v={view} /></div>,
    },
    {
      key: 'tasks', label: 'Tasks', badge: openTaskCount || undefined,
      children: taskProcesses.length
        ? <ProcessTasksPanel processes={taskProcesses} onThisPage={link => { const m = link.path.match(/^\/delivery\/work-orders\/([^?]+)(?:\?tab=(\w+))?/); if (m?.[1] !== wo.id) return false; setTab(m[2] ?? 'overview'); return true; }} />
        : <Panel title="Tasks" icon={ListTodo}><div className="vw-card-description">No process runs for this work order yet, so there are no tasks. Start the work order process on the Process tab.</div></Panel>,
    },
    {
      key: 'process', label: 'Process', children: view.p10
        ? <ProcessPanel recordType="workOrder" recordId={wo.id} businessKey={wo.woId ?? wo.id} title={row.title} dataCenterId={row.siteId} height={360} />
        : (
          <Panel title="Work order process (P10)" icon={Workflow} actions={<Btn icon={Play} onClick={() => void startP10()}>Start the work order process</Btn>}>
            <div className="vw-card-description">No work order process runs for this work order. The process tracks dispatch, acceptance by the technician, the work, verification by the requester and close-out.</div>
          </Panel>
        ),
    },
    { key: 'history', label: 'History', children: <HistorySection v={view} /> },
  ];
  const active = items.find(t => t.key === tab) ?? items[0];

  return (
    <OpsPage
      title={row.title}
      description={[wo.woId ?? wo.id, typeLabel(wo.type), view.site(row.siteId), `priority ${wo.priority ?? 'Medium'}`].filter(Boolean).join(' · ')}
      actions={<>
        <ToneChip v={woStatusTone(s)}>{woStatusLabel(s)}</ToneChip>
        {row.overdue && <ToneChip v="error">Overdue</ToneChip>}
        {view.p10 && <Btn icon={Workflow} onClick={() => view.p10 && navigate(`/workorders/instances/${view.p10.id}`)}>Open process</Btn>}
        {row.project && <Btn icon={FolderOpen} onClick={() => row.project && navigate(`/delivery/projects/${row.project.id}`)}>Open project</Btn>}
        {!assignHidden && <Btn icon={UserCog} onClick={() => setTab('assignment')}>Change assignment</Btn>}
        {s === 'InProgress' && <Btn variant="filled" onClick={() => setTab('execution')}>Sign off or record failure</Btn>}
        <Btn variant={s === 'Awaiting change approval' || s === 'Draft' ? 'filled' : 'outline'} icon={GitBranch} disabled={!c} onClick={() => c && navigate(`/changes/${c.id}`)}>{c ? `Open change ${c.chgId ?? c.id}` : 'No change linked'}</Btn>
        {!startHidden && <Btn variant={s === 'Ready' || s === 'Assigned' ? 'filled' : 'outline'} icon={Play} disabled={!!row.startBlock} title={row.startBlock ?? `Starts the work and puts change ${c?.chgId ?? ''} in progress`} onClick={startWork}>Start work</Btn>}
      </>}>

      <StatGrid cols={5}>
        <StatTile label="Window" value={<span title={fmtWindow(row.start, row.end)}>{fmtWindow(row.start, row.end)}</span>} sub={row.overdue ? 'overdue' : undefined} subTone={row.overdue ? 'bad' : undefined} />
        <StatTile label="Assignee" value={<span title={row.assignee}>{row.assignee}</span>} sub={wo.assigneeKind === 'contractor' ? 'contractor company' : 'own technician'} />
        <StatTile label="Change" value={c ? (c.chgId ?? c.id) : 'None'} sub={c ? <ToneChip v={CLASS_TONE[row.changeClass ?? 'Normal']} dot={false}>{row.changeClass}</ToneChip> : 'no change request'} subTone={c ? undefined : 'bad'} />
        <StatTile label="Checklist" value={<>{ticked}<small> / {steps.length}</small></>} sub="steps done" />
        <StatTile label="Open tasks" value={openTaskCount} sub={`across ${taskProcesses.length} process${taskProcesses.length === 1 ? '' : 'es'}`} />
      </StatGrid>

      <Panel title="Delivery chain" icon={GitBranch} sub={<ChainTrail links={[
        { kind: 'Plan', id: row.plan?.plnId, label: row.plan?.title, to: row.plan ? `/planning/plans/${row.plan.id}` : undefined },
        { kind: 'Programme', id: row.program?.progId ?? row.program?.id, label: row.program?.name, to: row.program ? `/delivery/programs/${row.program.id}` : undefined },
        { kind: 'Project', id: row.project?.projId ?? row.project?.id, label: row.project?.name, to: row.project ? `/delivery/projects/${row.project.id}` : undefined },
        { kind: 'Work order', id: wo.woId ?? wo.id, current: true },
        { kind: 'Change', id: c?.chgId ?? c?.id, label: c?.title, to: c ? `/changes/${c.id}` : undefined },
      ]} />}>
        <KV cols={3} items={[
          ['Type', typeLabel(wo.type)],
          ['Site', view.site(row.siteId)],
          ['Priority', wo.priority ?? 'Medium'],
        ]} />
      </Panel>

      <Tabs tabs={items.map(t => ({ id: t.key, label: t.label, count: t.badge }))} value={active.key} onChange={setTab} />
      <div key={active.key} className="col" style={{ gap: 16 }}>{active.children}</div>
    </OpsPage>
  );
}
