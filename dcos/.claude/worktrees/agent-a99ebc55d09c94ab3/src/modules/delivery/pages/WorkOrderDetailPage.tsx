/* Work order page — /delivery/work-orders/:workOrderId. Where it sits in the chain
   (plan → programme → project → work order → change), its status, and tabs: Overview,
   Assignment, Change, Execution, Process (P10) and History. Writes go through the chain
   actions and the process engine only. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App } from 'antd';
import { DetailPageHeader, TabBarV2, VwCard, VwChip, type DetailHeaderAction } from '../../../shared/components/ux';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { ProcessPanel } from '../../workorders/components/ProcessPanel';
import { useEngineActions } from '../../workorders/lib/useWorkflows';
import { useDeliveryData } from '../lib/chain';
import { useChainActions } from '../lib/workflowChain';
import { ChainTrail } from '../components/home/kit';
import { accessRequestOf, accessState, buildWorkOrderRow, CLASS_TONE, fmtWindow, p10Of, siteNamer, typeLabel, woStatusLabel, woStatusTone } from '../components/workorders/model';
import { OverviewSection, ChangeSection, HistorySection } from '../components/workorders/Sections';
import { AssignmentSection } from '../components/workorders/AssignmentSection';
import { ExecutionSection } from '../components/workorders/ExecutionSection';
import { checklistFor, type WorkOrderView } from '../components/workorders/view';

const TABS = ['overview', 'assignment', 'change', 'execution', 'process', 'history'] as const;

export default function WorkOrderDetailPage() {
  const { workOrderId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const d = useDeliveryData();
  const actions = useChainActions();
  const engine = useEngineActions();
  const [checks, setChecks] = useState<Record<string, boolean[]>>({});
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
    return {
      d, row, p10: p10Of(d, wo), access, accessState: wo.assigneeKind === 'contractor' ? accessState(access) : undefined,
      template: d.standardChangeTemplates.find(t => t.id === (wo.standardTemplateId ?? row.change?.standardTemplateId)),
      approvals: row.change ? d.approvalSteps.filter(a => a.changeRequestId === row.change!.id).sort((a, b) => a.order - b.order) : [],
      site: siteNamer(d),
      rackNames: rackIds.map(id => racks?.find(r => r.id === id)?.name ?? id), deviceNames: deviceIds.map(id => devices?.find(x => x.id === id)?.name ?? id),
      actions,
    };
  }, [d, wo, racks, devices, rackIds, deviceIds, actions]);

  if (!d.ready) return <VwCard loading>Loading work order…</VwCard>;
  if (!wo || !view) {
    return (
      <div className="vw-flex vw-flex-col vw-page-gap">
        <DetailPageHeader backTo="/delivery/work-orders" backLabel="Work orders" name="Work order not found" sticky={false} />
        <VwCard><div className="vw-card-description">No work order with id {workOrderId}. <Link to="/delivery/work-orders">Back to the work order list</Link>.</div></VwCard>
      </div>
    );
  }

  const { row } = view; const c = row.change;
  const done = checks[wo.id] ?? [];
  const steps = checklistFor(view).steps;
  const s = wo.status;
  const startWork = () => { const r = actions.startWork(wo.id); if (r.ok) { message.success('Work started; the change is now in progress'); setTab('execution'); } else message.error(r.reason ?? 'The work cannot start'); };
  const startP10 = async () => {
    const inst = await engine.startInstance('work-order', wo.woId ?? wo.id, { recordType: 'workOrder', recordId: wo.id, dataCenterId: row.siteId, title: row.title, variables: { workType: wo.type, assignee: wo.assigneeName, changeRequestId: c?.id } });
    message.success(`Work order process ${inst.id} started`);
  };

  const headerActions: DetailHeaderAction[] = [
    { key: 'start', label: 'Start work', primary: s === 'Ready' || s === 'Assigned', hidden: !['Ready', 'Assigned', 'Awaiting change approval', 'Draft'].includes(s), disabled: !!row.startBlock, tooltip: row.startBlock ?? `Starts the work and puts change ${c?.chgId ?? ''} in progress`, onClick: startWork },
    { key: 'change', label: c ? `Open change ${c.chgId ?? c.id}` : 'No change linked', primary: s === 'Awaiting change approval' || s === 'Draft', disabled: !c, onClick: () => c && navigate(`/changes/${c.id}`) },
    { key: 'finish', label: 'Sign off or record failure', primary: s === 'InProgress', hidden: s !== 'InProgress', onClick: () => setTab('execution') },
    { key: 'assign', label: 'Change assignment', hidden: !['Draft', 'Awaiting change approval', 'Ready', 'Assigned'].includes(s), onClick: () => setTab('assignment') },
    { key: 'project', label: 'Open project', hidden: !row.project, onClick: () => row.project && navigate(`/delivery/projects/${row.project.id}`) },
    { key: 'process', label: 'Open process', hidden: !view.p10, onClick: () => view.p10 && navigate(`/workorders/instances/${view.p10.id}`) },
  ];

  const items = [
    { key: 'overview', label: 'Overview', children: tab === 'overview' ? <OverviewSection v={view} /> : null },
    { key: 'assignment', label: 'Assignment', badge: wo.assigneeKind === 'contractor' && !view.accessState?.approved ? '!' : undefined, children: tab === 'assignment' ? <AssignmentSection key={`${wo.id}-${wo.updatedAt}`} v={view} /> : null },
    { key: 'change', label: 'Change', badge: !c ? '!' : undefined, children: tab === 'change' ? <ChangeSection v={view} /> : null },
    { key: 'execution', label: 'Execution', badge: s === 'InProgress' ? `${steps.filter((_, i) => done[i]).length}/${steps.length}` : undefined, children: tab === 'execution' ? <ExecutionSection v={view} done={done} setDone={n => setChecks(x => ({ ...x, [wo.id]: n }))} /> : null },
    {
      key: 'process', label: 'Process', children: tab === 'process' ? (view.p10
        ? <ProcessPanel recordType="workOrder" recordId={wo.id} businessKey={wo.woId ?? wo.id} title={row.title} dataCenterId={row.siteId} height={360} />
        : (
          <VwCard title="Work order process (P10)">
            <div className="vw-flex vw-justify-between vw-items-center vw-gap-md vw-wrap">
              <div className="vw-card-description">No work order process runs for this work order. The process tracks dispatch, acceptance by the technician, the work, verification by the requester and close-out.</div>
              <Button onClick={() => void startP10()}>Start the work order process</Button>
            </div>
          </VwCard>
        )) : null,
    },
    { key: 'history', label: 'History', children: tab === 'history' ? <HistorySection v={view} /> : null },
  ];

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <DetailPageHeader
        backTo="/delivery/work-orders" backLabel="Work orders"
        code={wo.woId ?? wo.id} name={row.title}
        statusPill={<span className="vw-inline-flex vw-items-center vw-gap-xs"><VwChip variant={woStatusTone(s)}>{woStatusLabel(s)}</VwChip>{row.overdue && <VwChip variant="error">Overdue</VwChip>}</span>}
        subtitle={<ChainTrail links={[
          { kind: 'Plan', id: row.plan?.plnId, label: row.plan?.title, to: row.plan ? `/planning/plans/${row.plan.id}` : undefined },
          { kind: 'Programme', id: row.program?.progId ?? row.program?.id, label: row.program?.name, to: row.program ? `/delivery/programs/${row.program.id}` : undefined },
          { kind: 'Project', id: row.project?.projId ?? row.project?.id, label: row.project?.name, to: row.project ? `/delivery/projects/${row.project.id}` : undefined },
          { kind: 'Work order', id: wo.woId ?? wo.id, current: true },
          { kind: 'Change', id: c?.chgId ?? c?.id, label: c?.title, to: c ? `/changes/${c.id}` : undefined },
        ]} />}
        properties={[
          { label: 'Type', value: typeLabel(wo.type) },
          { label: 'Site', value: view.site(row.siteId) },
          { label: 'Window', value: fmtWindow(row.start, row.end), tone: row.overdue ? 'critical' : undefined },
          { label: 'Priority', value: wo.priority ?? 'Medium' },
          { label: 'Assignee', value: row.assignee },
          { label: 'Change', value: c ? <span className="vw-inline-flex vw-items-center vw-gap-xs">{c.chgId ?? c.id}<VwChip variant={CLASS_TONE[row.changeClass ?? 'Normal']}>{row.changeClass}</VwChip></span> : 'None', tone: c ? undefined : 'critical' },
        ]}
        actions={headerActions}
      />
      <TabBarV2 activeKey={tab} onChange={setTab} items={items} primaryCap={items.length + 1} />
    </div>
  );
}
