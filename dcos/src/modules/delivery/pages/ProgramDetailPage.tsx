import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
/* Programme detail — /delivery/programs/:programId. A programme is a large body of work driven by its
   blueprint (it has no process of its own): its projects in build order, their work orders and
   changes rolled up, procurement and materials, permits, commissioning, documents and history. Reads through
   useDeliveryData + chainOfProgram. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Modal, Spin } from 'antd';
import type * as T from '../../../mock/data/types';
import type { ProgramStatus } from '../../../mock/data/enums';
import { ArrowRightLeft, ClipboardList, FolderOpen, GitBranch, PauseCircle, ScrollText, ShoppingCart } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, KV, Panel, Tabs } from '../../../ops/ui/kit';
import { SoftMeter, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecords } from '../components/project/useRecords';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { chainOfProgram, isOpenChange, isOpenWorkOrder, useDeliveryData } from '../lib/chain';
import { blueprintForProgramType } from '../lib/programBlueprints';
import { describeInstance } from '../../workorders/lib/useWorkflows';
import { ChainTrail, ToneChip } from '../components/project/kit';
import { ChangesTable, WorkOrdersTable } from '../components/project/ChainTables';
import { PermitsTable, ProcurementTable, type PoRow } from '../components/project/ProjectTabs';
import { PROGRAM_STATUS_TONE, changeRows, money, pct, shortDate, workOrderRows } from '../components/project/format';
import { ProgramOverviewTab, type PhaseRow } from '../components/program/ProgramOverviewTab';
import { ProgramMaterialsCard } from '../components/program/ProgramMaterials';
import { ProgramCommissioningTab, ProgramDocumentsTab, ProgramHistoryTab, ProgramProjectsTab, type ProjectLine } from '../components/program/ProgramTabs';

const TABS = ['overview', 'projects', 'workorders', 'changes', 'procurement', 'permits', 'commissioning', 'documents', 'history'];
// Lifecycle: Proposed → Planning → Active → Closed, with On Hold as a side state.
const LIFECYCLE: ProgramStatus[] = ['Proposed', 'Planning', 'Active', 'Closed'];
const nextStatus = (s: ProgramStatus): ProgramStatus | null => { if (s === 'On Hold') return null; const i = LIFECYCLE.indexOf(s); return i >= 0 && i < LIFECYCLE.length - 1 ? LIFECYCLE[i + 1] : null; };

export default function ProgramDetailPage() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab') ?? '') ? params.get('tab')! : 'overview';
  const setTab = (k: string) => { const next = new URLSearchParams(params); if (k === 'overview') next.delete('tab'); else next.set('tab', k); setParams(next, { replace: true }); };
  const updateProgram = useEntityUpdate('programs');
  const audit = useRecordAudit();

  const d = useDeliveryData();
  const chain = useMemo(() => (programId ? chainOfProgram(d, programId) : undefined), [d, programId]);
  const boms = useRecords<T.BOM>('boms', 1000);
  const changeOrders = useRecords<T.ChangeOrder>('changeOrders', 2000);
  const designDocs = useRecords<T.DesignDocument>('designDocuments', 2000);
  const [closing, setClosing] = useState(false);

  const projects = chain?.projects;
  const m = useMemo(() => {
    if (!chain || !projects) return undefined;
    const coBy = (pid: string) => changeOrders.filter((c) => c.projectId === pid && c.status === 'Approved').reduce((s, c) => s + c.budgetDelta, 0);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const ordered = [...projects].sort((a, b) => (a.phase ?? 999) - (b.phase ?? 999) || a.plannedStart.localeCompare(b.plannedStart));
    const phases: PhaseRow[] = ordered.map((p, i) => {
      const preds = (p.dependsOnProjectIds ?? []).map((id) => byId.get(id)).filter(Boolean) as T.Project[];
      const waiting = preds.filter((x) => x.percentComplete < 100 && x.status !== 'Completed');
      const done = p.status === 'Completed' || p.percentComplete >= 100;
      return {
        p, order: i + 1, preds, waiting, budget: p.budget + coBy(p.id), spend: p.actualSpend,
        gate: done ? 'Done' : waiting.length ? (p.longLead ? 'Long lead' : 'Waiting') : p.percentComplete > 0 ? 'In progress' : 'Ready',
        permits: chain.permits.filter((x) => x.projectId === p.id), designDocs: designDocs.filter((x) => x.projectId === p.id),
      };
    });
    const lines: ProjectLine[] = phases.map((r) => {
      const inst = d.processInstances.filter((i) => i.recordType === 'project' && i.recordId === r.p.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
      const ms = chain.milestones.filter((x) => x.projectId === r.p.id && x.status !== 'Completed').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return {
        p: r.p, order: r.p.phase != null ? r.order : undefined, budget: r.budget, spend: r.spend, nextGate: ms[0],
        stage: r.gate === 'Done' && (!inst || inst.state === 'completed') ? 'Completed' : inst ? describeInstance(inst, d.userTasks).step : r.gate === 'Waiting' ? `Waiting on ${r.waiting.length} earlier phase${r.waiting.length === 1 ? '' : 's'}` : 'No process',
        openWos: chain.workOrders.filter((w) => w.projectId === r.p.id && isOpenWorkOrder(w)).length,
        openChanges: chain.changes.filter((c) => c.projectId === r.p.id && isOpenChange(c)).length,
      };
    });
    const budget = phases.reduce((s, r) => s + r.budget, 0);
    const spend = phases.reduce((s, r) => s + r.spend, 0);
    const bomIds = new Set(boms.filter((b) => b.projectId && byId.has(b.projectId)).map((b) => b.id));
    const pos = new Map<string, T.PurchaseOrder>();
    for (const p of [...chain.purchaseOrders, ...d.purchaseOrders.filter((x) => x.bomId && bomIds.has(x.bomId))]) pos.set(p.id, p);
    const poRows: PoRow[] = [...pos.values()].map((po) => { const bom = boms.find((b) => b.id === po.bomId); return { po, bom, vendor: d.vendors.find((v) => v.id === po.vendorId), project: bom?.projectId ? byId.get(bom.projectId) : undefined }; })
      .sort((a, b) => (a.po.needBy ?? '').localeCompare(b.po.needBy ?? ''));
    return { phases, lines, budget, spend, poRows, wo: workOrderRows(d, chain.workOrders), ch: changeRows(d, chain.changes) };
  }, [chain, projects, changeOrders, designDocs, boms, d]);

  if (!chain || !m) {
    if (!d.ready) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;
    return (
      <PageEmptyState title="Programme not found" description={<>No programme with id {programId}. <Link to="/delivery/programs">Back to the programmes</Link>.</>} />
    );
  }

  const { program: prog, plan } = chain;
  const blueprint = blueprintForProgramType(prog.type);
  const ps = chain.projects;
  const avg = ps.length ? Math.round(ps.reduce((s, p) => s + p.percentComplete, 0) / ps.length) : 0;
  const done = ps.filter((p) => p.status === 'Completed' || p.percentComplete >= 100).length;
  const waiting = m.phases.filter((r) => r.gate === 'Waiting').length;
  const openWos = chain.workOrders.filter(isOpenWorkOrder);
  const openChanges = chain.changes.filter(isOpenChange);
  const awaiting = chain.changes.filter((c) => ['Draft', 'Submitted', 'UnderReview'].includes(c.status)).length;
  // Project budgets (with approved change orders) once projects exist; the programme envelope before that.
  const budget = m.budget || prog.budget;

  const setStatus = (to: ProgramStatus) => updateProgram.mutate({ id: prog.id, data: { status: to, updatedAt: new Date().toISOString() } }, { onSuccess: () => { audit('Program', prog.progId, to, `Programme lifecycle → ${to}`); message.success(`Programme is now ${to}`); } });
  const next = nextStatus(prog.status);
  const openProjects = ps.filter((p) => p.status !== 'Completed').length;
  const tabItems: { key: string; label: string; badge?: number; children: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', children: <ProgramOverviewTab chain={chain} phases={m.phases} budget={budget} spend={m.spend} /> },
    { key: 'projects', label: 'Projects', badge: ps.length || undefined, children: <ProgramProjectsTab lines={m.lines} programName={prog.name} /> },
    { key: 'workorders', label: 'Work orders', badge: openWos.length || undefined, children: (
      <Panel title="Work orders across the projects" icon={ClipboardList} count={chain.workOrders.length} sub={`${chain.workOrders.length} in total, ${openWos.length} open`}>
        <div className="col" style={{ gap: 8 }}>
          <div className="vw-card-description">Work orders are raised by each project's process steps. Raise new ones from the project page.</div>
          <WorkOrdersTable rows={m.wo} showProject empty="No work orders yet. Projects raise them as their process reaches work on the estate." />
        </div>
      </Panel>
    ) },
    { key: 'changes', label: 'Changes', badge: openChanges.length || undefined, children: (
      <Panel title="Changes across the projects" icon={ArrowRightLeft} count={chain.changes.length} sub={`${chain.changes.length} in total, ${openChanges.length} open, ${awaiting} awaiting approval`}>
        <div className="col" style={{ gap: 8 }}>
          <div className="vw-card-description">One change request per work order. Standard changes are pre-approved by their template; normal changes go to the weekly change board; emergency changes go to the emergency board and are reviewed afterwards.</div>
          <ChangesTable rows={m.ch} showProject empty="No changes yet. Each work order raises its change." />
        </div>
      </Panel>
    ) },
    { key: 'procurement', label: 'Procurement and materials', badge: m.poRows.length || undefined, children: (
      <div className="col" style={{ gap: 16 }}>
        <Panel title="Purchase orders" icon={ShoppingCart} count={m.poRows.length} sub={`${m.poRows.length} orders · ${money(m.poRows.reduce((s, r) => s + r.po.plannedCost, 0))} · ${money(m.poRows.reduce((s, r) => s + r.po.actualSpend, 0))} paid`}>
          <ProcurementTable rows={m.poRows} showProject empty="No purchase orders for this programme, its plan or its projects." />
        </Panel>
        <ProgramMaterialsCard projects={ps} programName={prog.name} />
      </div>
    ) },
    { key: 'permits', label: 'Permits', badge: chain.permits.filter((p) => p.status !== 'Approved').length || undefined, children: (
      <Panel title="Permits" icon={ScrollText} sub={`${chain.permits.filter((p) => p.status === 'Approved').length} of ${chain.permits.length} approved`} actions={<Link className="panel-link" to="/delivery/permits">Permit register</Link>}>
        <PermitsTable permits={chain.permits} projects={ps} />
      </Panel>
    ) },
    { key: 'commissioning', label: 'Commissioning', children: <ProgramCommissioningTab programName={prog.name} projects={ps} atps={chain.atps} hotos={d.hotos.filter((h) => ps.some((p) => p.id === h.projectId))} /> },
    { key: 'documents', label: 'Documents', children: <ProgramDocumentsTab program={prog} projects={ps} /> },
    { key: 'history', label: 'History', children: <ProgramHistoryTab program={prog} projects={ps} /> },
  ];
  const active = tabItems.find((t) => t.key === tab) ?? tabItems[0];

  return (
    <OpsPage
      title={prog.name}
      description={[prog.progId, prog.type, blueprint?.name, `owned by ${prog.ownerName}`].filter(Boolean).join(' · ')}
      actions={<>
        <ToneChip v={PROGRAM_STATUS_TONE[prog.status] ?? 'neutral'}>{prog.status}</ToneChip>
        {plan && <Btn icon={FolderOpen} onClick={() => navigate(`/planning/plans/${plan.id}`)}>Open plan</Btn>}
        {next === 'Closed' && <Btn variant="danger-subtle" onClick={() => setClosing(true)}>Close programme</Btn>}
        {prog.status === 'Active' && <Btn onClick={() => setStatus('On Hold')}>Put on hold</Btn>}
        {next && next !== 'Closed' && <Btn variant={prog.status !== 'On Hold' ? 'filled' : 'outline'} onClick={() => setStatus(next)}>Move to {next}</Btn>}
        {prog.status === 'On Hold' && <Btn variant="filled" onClick={() => setStatus('Active')}>Reactivate</Btn>}
      </>}>

      {prog.status === 'On Hold' && (
        <div className="note note--warn"><PauseCircle size={15} /><span>The programme is on hold. Its projects keep their state; nothing new should start until it is reactivated.</span></div>
      )}

      <StatGrid>
        <StatTile label="Projects" value={ps.length} sub={`${done} done${waiting ? `, ${waiting} waiting on earlier phases` : ''}`} />
        <StatTile label="Completion" value={pct(avg)} sub="average across projects"><SoftMeter pct={avg} tone="info" /></StatTile>
        <StatTile label="Budget" value={money(budget)} sub={!m.budget ? 'programme envelope; no project budgets yet' : m.budget !== prog.budget ? `envelope ${money(prog.budget)}` : 'sum of project budgets'} />
        <StatTile label="Spend" value={money(m.spend)} sub={budget ? `${pct((m.spend / budget) * 100)} of budget` : undefined} subTone={m.spend > budget ? 'bad' : undefined}>
          {budget ? <SoftMeter pct={(m.spend / budget) * 100} tone={m.spend > budget ? 'error' : 'info'} /> : null}
        </StatTile>
        <StatTile label="Open work orders" value={openWos.length} sub={`${chain.workOrders.filter((w) => w.status === 'Awaiting change approval').length} awaiting change approval`} />
        <StatTile label="Open changes" value={openChanges.length} sub={`${awaiting} awaiting approval`} />
      </StatGrid>

      <Panel title="Delivery chain" icon={GitBranch} sub={<ChainTrail steps={[
        { label: 'Plan', code: plan?.plnId, to: plan ? `/planning/plans/${plan.id}` : undefined },
        { label: 'Programme', code: prog.progId, current: true },
        { label: 'Projects', code: String(ps.length), to: '?tab=projects' },
        { label: 'Work orders', code: String(chain.workOrders.length), to: '?tab=workorders' },
        { label: 'Changes', code: String(chain.changes.length), to: '?tab=changes' },
      ]} />}>
        <KV cols={5} items={[
          ['Type', prog.type],
          ['Blueprint', blueprint?.name ?? 'None (a container of projects)'],
          ['Owner', prog.ownerName],
          ['Budget', money(prog.budget)],
          ['Dates', `${shortDate(prog.startDate)} to ${shortDate(prog.endDate)}`],
        ]} />
      </Panel>

      {/* Every tab is shown; nothing hides behind a "More" menu. */}
      <Tabs tabs={tabItems.map((t) => ({ id: t.key, label: t.label, count: t.badge }))} value={active.key} onChange={setTab} />
      <div key={active.key} className="col" style={{ gap: 16 }}>{active.children}</div>

      <Modal open={closing} title={`Close ${prog.progId}?`} okText="Close programme" okButtonProps={{ danger: true }} onCancel={() => setClosing(false)} onOk={() => { setStatus('Closed'); setClosing(false); }}>
        <div className="vw-card-description">{openProjects ? `${openProjects} project${openProjects === 1 ? ' is' : 's are'} not complete. Close or cancel them first, or close the programme anyway and keep them open.` : 'Every project is complete. Closing makes the programme read-only.'}</div>
      </Modal>
    </OpsPage>
  );
}
