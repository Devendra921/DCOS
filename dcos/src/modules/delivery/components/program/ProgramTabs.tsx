/* Programme tabs other than the overview: projects, commissioning roll-up, documents and history. */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type * as T from '../../../../mock/data/types';
import { ClipboardCheck, FileText, FolderKanban, Handshake, History, Paperclip } from 'lucide-react';
import { Chip, Panel } from '../../../../ops/ui/kit';
import { useEntityList } from '../../../../shared/hooks/useEntityCRUD';
import { EntityDocumentsTab } from '../../../../shared/components/detail';
import { DataTable, Muted, Bar, ToneChip } from '../project/kit';
import { useRecords } from '../project/useRecords';
import { ATP_TONE, PROJECT_STATUS_TONE, RAG_TONE, daysFrom, fmtDate, money, pct, dateTime, shortName } from '../project/format';

export interface ProjectLine { p: T.Project; order?: number; stage: string; nextGate?: T.Milestone; openWos: number; openChanges: number; budget: number; spend: number }

export function ProgramProjectsTab({ lines, programName }: { lines: ProjectLine[]; programName: string }) {
  return (
    <Panel title="Projects" icon={FolderKanban} count={lines.length}>
      <DataTable rows={lines} rowKey={(l) => l.p.id} empty="No projects in this programme yet."
        cols={[
          { key: 'n', title: 'Project', wrap: true, render: (l) => <span className="cell-2" style={{ minWidth: 0 }}><span><Link to={`/delivery/projects/${l.p.id}`}>{l.order ? `${l.order}. ` : ''}{shortName(l.p.name, programName)}</Link></span><small style={{ whiteSpace: 'normal' }}>{l.p.projId} · {l.p.template ?? 'no template'} · {l.p.managerName}</small></span> },
          { key: 'st', title: 'Status', render: (l) => <ToneChip v={PROJECT_STATUS_TONE[l.p.status] ?? 'neutral'}>{l.p.status}</ToneChip> },
          { key: 'stage', title: 'Stage', wrap: true, render: (l) => l.stage },
          { key: 'rag', title: 'RAG', render: (l) => <ToneChip v={RAG_TONE[l.p.rag] ?? 'neutral'}>{l.p.rag}</ToneChip> },
          { key: 'c', title: 'Complete', render: (l) => <span className="vw-inline-flex vw-items-center vw-gap-sm"><Bar value={l.p.percentComplete} max={100} width={70} /><Muted>{pct(l.p.percentComplete)}</Muted></span> },
          { key: 's', title: 'Spend', align: 'right', render: (l) => <span style={{ color: l.spend > l.budget ? 'var(--vw-color-red-600)' : undefined }}>{money(l.spend)} <Muted size="xs">of {money(l.budget)}</Muted></span> },
          { key: 'g', title: 'Next gate', wrap: true, render: (l) => l.nextGate ? <span>{l.nextGate.name} <Muted size="xs">{fmtDate(l.nextGate.dueDate)}{daysFrom(l.nextGate.dueDate) < 0 ? ', late' : ''}</Muted></span> : <Muted>None open</Muted> },
          { key: 'w', title: 'Open WO / changes', align: 'right', render: (l) => (l.openWos || l.openChanges ? `${l.openWos} / ${l.openChanges}` : <Muted>—</Muted>) },
        ]} />
    </Panel>
  );
}

export function ProgramCommissioningTab({ projects, atps, hotos, programName }: { projects: T.Project[]; atps: T.Atp[]; hotos: T.Hoto[]; programName: string }) {
  const byProject = (id: string) => projects.find((p) => p.id === id);
  const accepted = atps.filter((a) => a.status === 'Accepted').length;
  const rows = projects.map((p) => {
    const a = atps.filter((x) => x.projectId === p.id);
    return { p, atps: a.length, accepted: a.filter((x) => x.status === 'Accepted').length, hoto: hotos.find((h) => h.projectId === p.id) };
  });
  return (
    <div className="col" style={{ gap: 16 }}>
      <Panel title="Handover by project" icon={Handshake} sub={`${hotos.filter((h) => h.status.startsWith('Accepted')).length} of ${projects.length} handed over`}>
        <DataTable rows={rows} rowKey={(r) => r.p.id}
          cols={[
            { key: 'n', title: 'Project', wrap: true, render: (r) => <Link to={`/delivery/projects/${r.p.id}?tab=commissioning`}>{shortName(r.p.name, programName)}</Link> },
            { key: 'a', title: 'Acceptance tests', render: (r) => (r.atps ? <span className="vw-inline-flex vw-items-center vw-gap-sm"><Bar value={r.accepted} max={r.atps} width={70} /><Muted>{r.accepted} of {r.atps} accepted</Muted></span> : <Muted>none yet</Muted>) },
            { key: 'h', title: 'Handover', render: (r) => (r.hoto ? <Chip tone={r.hoto.status.startsWith('Accepted') ? 'success' : 'warning'} dot>{r.hoto.status}</Chip> : <Muted>not started</Muted>) },
            { key: 'w', title: 'Warranty from', render: (r) => fmtDate(r.hoto?.warrantyStart) },
          ]} />
      </Panel>
      <Panel title="Acceptance tests" icon={ClipboardCheck} sub={`${accepted} of ${atps.length} accepted`}>
        <DataTable rows={atps} rowKey={(a) => a.id} empty="No acceptance tests yet. They are created on each project's Commissioning tab."
          cols={[
            { key: 'n', title: 'Test', wrap: true, render: (a) => a.name },
            { key: 'p', title: 'Project', wrap: true, render: (a) => { const p = byProject(a.projectId); return p ? <Link to={`/delivery/projects/${p.id}?tab=commissioning`}>{shortName(p.name, programName)}</Link> : '—'; } },
            { key: 's', title: 'System', render: (a) => a.system },
            { key: 'l', title: 'Level', render: (a) => a.level },
            { key: 'w', title: 'Witnessed by', render: (a) => a.witnessedBy ?? <Muted>—</Muted> },
            { key: 'st', title: 'Status', render: (a) => <ToneChip v={ATP_TONE[a.status] ?? 'neutral'}>{a.status}</ToneChip> },
          ]} />
      </Panel>
    </div>
  );
}

export function ProgramDocumentsTab({ program, projects }: { program: T.Program; projects: T.Project[] }) {
  const all = (useEntityList('designDocuments', { pageSize: 2000 }).data?.data ?? []) as unknown as T.DesignDocument[];
  const pids = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const docs = all.filter((x) => x.programId === program.id || (x.projectId && pids.has(x.projectId)));
  return (
    <div className="col" style={{ gap: 16 }}>
      <Panel title="Design documents" icon={FileText} count={docs.length} actions={<Link className="panel-link" to="/delivery/design">Design register</Link>}>
        <DataTable rows={docs} rowKey={(x) => x.id} empty="No design documents for this programme."
          cols={[
            { key: 'n', title: 'Document', wrap: true, render: (x) => x.name },
            { key: 'p', title: 'Project', wrap: true, render: (x) => { const p = projects.find((q) => q.id === x.projectId); return p ? <Link to={`/delivery/projects/${p.id}`}>{p.name}</Link> : <Muted>Programme</Muted>; } },
            { key: 't', title: 'Type', render: (x) => x.type },
            { key: 'r', title: 'Revision', render: (x) => x.revision },
            { key: 'i', title: 'Issued', render: (x) => fmtDate(x.issuedDate) },
            { key: 's', title: 'Status', render: (x) => x.status },
          ]} />
      </Panel>
      <Panel title="Attached documents" icon={Paperclip}><EntityDocumentsTab entityId={program.id} /></Panel>
    </div>
  );
}

export function ProgramHistoryTab({ program, projects }: { program: T.Program; projects: T.Project[] }) {
  const events = useRecords<T.AuditEvent>('auditEvents', 5000);
  const pids = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const projIds = useMemo(() => new Set(projects.map((p) => p.projId)), [projects]);
  const rows = useMemo(() => events.filter((e) => (e.entityType === 'Program' && (e.entityId === program.progId || e.entityId === program.id)) || (e.projectId && pids.has(e.projectId)) || (e.entityType === 'Project' && projIds.has(e.entityId)))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [events, program, pids, projIds]);
  return (
    <Panel title="History" icon={History} sub={`${rows.length} entries for the programme and its projects, newest first`}>
      <DataTable rows={rows.slice(0, 300)} rowKey={(e) => e.id} empty="No recorded activity yet. Lifecycle changes and project actions appear here."
        cols={[
          { key: 'w', title: 'When', render: (e) => dateTime(e.timestamp) },
          { key: 'who', title: 'Who', render: (e) => e.actorName },
          { key: 'r', title: 'Record', render: (e) => `${e.entityType} ${e.entityId}` },
          { key: 'a', title: 'Action', render: (e) => e.action },
          { key: 's', title: 'Summary', wrap: true, render: (e) => <Muted>{e.summary}</Muted> },
        ]} />
    </Panel>
  );
}
