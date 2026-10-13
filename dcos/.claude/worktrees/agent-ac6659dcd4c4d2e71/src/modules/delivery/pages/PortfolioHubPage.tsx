/* Programmes (/delivery/programs) and Projects (/delivery/projects) tabs of the delivery hub:
   one searchable table each. A programme is driven by its blueprint; each project runs its own
   process, raises work orders, and each work order its change. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Input, Select } from 'antd';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { SearchOutlined } from '../../../shared/icons';
import { DcScopeSelect, useDcScope } from '../../../core/scope/DcScope';
import { PROGRAM_STATUS, PROJECT_STATUS, RAG_VALUES } from '../../../mock/data/enums';
import { DELIVERY_STAGES } from '../lib/deliverExec';
import { DataTable, Muted, ShareBar, TwoLine } from '../components/home/kit';
import { buildProgrammeRows, type ProgrammeRow, type ProjectRow } from '../components/home/model';
import { useProjectRows } from '../components/home/hooks';
import { PROGRAM_STATUS_TONE, PROJECT_STATUS_TONE, RAG_TONE, STAGE_TONE, tone } from '../components/home/tones';
import { fmtMoney, siteNamer } from '../components/workorders/model';

const has = (q: string, ...xs: (string | undefined)[]) => !q || xs.some(x => x?.toLowerCase().includes(q));

export function ProgrammesPage() {
  const { d, x, rows } = useProjectRows();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>();
  const programmes = useMemo(() => buildProgrammeRows(d, d.programs, rows.map(r => r.project), x), [d, x, rows]);
  const ql = q.trim().toLowerCase();
  const shown = programmes.filter(p => has(ql, p.program.name, p.program.id, p.program.ownerName, p.blueprint) && (!status || p.program.status === status));
  if (!d.ready) return <VwCard loading>Loading programmes…</VwCard>;
  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
        <Input prefix={<SearchOutlined />} allowClear placeholder="Search programmes, owners, blueprints" value={q} onChange={e => setQ(e.target.value)} style={{ width: 320 }} aria-label="Search programmes" />
        <Select allowClear placeholder="Any status" value={status} onChange={setStatus} style={{ minWidth: 160 }} options={PROGRAM_STATUS.map(v => ({ value: v, label: v }))} aria-label="Programme status" />
        <span style={{ flex: 1 }} />
        <Muted>{shown.length} of {programmes.length} programmes</Muted>
      </div>
      <VwCard>
        <DataTable<ProgrammeRow> rows={shown} rowKey={p => p.program.id} to={p => `/delivery/programs/${p.program.id}`}
          empty={programmes.length ? 'No programme matches. Clear the search or the status filter.' : 'No programmes yet. Start the build of an approved plan, or create a programme with New programme.'}
          cols={[
            { key: 'n', title: 'Programme', wrap: true, minWidth: 240, render: p => <TwoLine main={p.program.name} sub={`${p.program.progId ?? p.program.id} · ${p.program.ownerName}`} /> },
            { key: 't', title: 'Type and blueprint', wrap: true, minWidth: 180, render: p => <TwoLine main={p.program.type} sub={p.blueprint} /> },
            { key: 's', title: 'Status', render: p => <VwChip variant={tone(PROGRAM_STATUS_TONE, p.program.status)}>{p.program.status}</VwChip> },
            { key: 'pr', title: 'Projects', align: 'right', render: p => p.projects.length },
            { key: 'c', title: 'Completion', width: 200, render: p => <ShareBar pct={p.completion} /> },
            { key: 'b', title: 'Budget', align: 'right', render: p => fmtMoney(p.ev.bac || p.program.budget) },
            { key: 'sp', title: 'Spend', align: 'right', render: p => fmtMoney(p.ev.ac) },
            { key: 'pl', title: 'Source plan', render: p => (p.program.plannerPlanId ? <Link to={`/planning/plans/${p.program.plannerPlanId}`}>{p.plan?.plnId ?? p.program.plannerPlanId}</Link> : <Muted>created by hand</Muted>) },
          ]} />
      </VwCard>
    </div>
  );
}

export function ProjectsPage() {
  const { d, rows } = useProjectRows();
  const { dcId } = useDcScope();
  const [q, setQ] = useState('');
  const [programId, setProgramId] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [rag, setRag] = useState<string>();
  const [stage, setStage] = useState<string>();
  const site = useMemo(() => siteNamer(d), [d]);
  const ql = q.trim().toLowerCase();
  const shown = rows.filter(r => (dcId === 'all' || r.project.dataCenterId === dcId) && (!programId || r.project.programId === programId) && (!status || r.project.status === status)
    && (!rag || r.project.rag === rag) && (!stage || r.stage === stage) && has(ql, r.project.name, r.project.id, r.project.managerName, r.program?.name, r.project.template));
  const filtered = !!(ql || programId || status || rag || stage || dcId !== 'all');
  if (!d.ready) return <VwCard loading>Loading projects…</VwCard>;
  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <div className="vw-flex vw-items-center vw-gap-sm vw-wrap">
        <Input prefix={<SearchOutlined />} allowClear placeholder="Search projects, managers, templates" value={q} onChange={e => setQ(e.target.value)} style={{ width: 280 }} aria-label="Search projects" />
        <DcScopeSelect />
        <Select allowClear placeholder="All programmes" value={programId} onChange={setProgramId} style={{ minWidth: 200 }} showSearch optionFilterProp="label" options={d.programs.map(p => ({ value: p.id, label: p.name }))} aria-label="Programme" />
        <Select allowClear placeholder="Any status" value={status} onChange={setStatus} style={{ minWidth: 130 }} options={PROJECT_STATUS.map(v => ({ value: v, label: v }))} aria-label="Project status" />
        <Select allowClear placeholder="Any RAG" value={rag} onChange={setRag} style={{ minWidth: 110 }} options={RAG_VALUES.map(v => ({ value: v, label: v }))} aria-label="RAG" />
        <Select allowClear placeholder="Any stage" value={stage} onChange={setStage} style={{ minWidth: 120 }} options={DELIVERY_STAGES.map(v => ({ value: v, label: v }))} aria-label="Stage" />
        <span style={{ flex: 1 }} />
        <Muted>{shown.length} of {rows.length} projects</Muted>
      </div>
      <VwCard>
        <DataTable<ProjectRow> rows={shown} rowKey={r => r.project.id} to={r => `/delivery/projects/${r.project.id}`}
          empty={filtered ? 'No project matches. Clear the search or the filters.' : 'No projects yet. Projects are created when a programme starts its phases, or with New project.'}
          cols={[
            { key: 'n', title: 'Project', wrap: true, minWidth: 180, render: r => <TwoLine main={r.project.name} sub={`${r.project.projId ?? r.project.id} · ${r.project.managerName}`} /> },
            { key: 'pg', title: 'Programme', wrap: true, minWidth: 130, render: r => r.program?.name ?? <Muted>none</Muted> },
            { key: 't', title: 'Template', wrap: true, render: r => r.project.template ?? <Muted>none</Muted> },
            { key: 'st', title: 'Stage', render: r => <VwChip variant={tone(STAGE_TONE, r.stage)}>{r.stage}</VwChip> },
            { key: 'rag', title: 'RAG and status', render: r => <span className="vw-flex vw-flex-col vw-gap-xs" style={{ alignItems: 'flex-start' }}><VwChip variant={tone(RAG_TONE, r.project.rag)}>{r.project.rag}</VwChip>{r.project.status !== 'Active' && <VwChip variant={tone(PROJECT_STATUS_TONE, r.project.status)}>{r.project.status}</VwChip>}</span> },
            { key: 'c', title: 'Done', align: 'right', render: r => `${Math.round(r.project.percentComplete)}%` },
            { key: 'si', title: 'Site', wrap: true, render: r => site(r.project.dataCenterId) },
            { key: 'open', title: 'Open work', render: r => <TwoLine main={`${r.openWorkOrders} work order${r.openWorkOrders === 1 ? '' : 's'}`} sub={`${r.openChanges} change${r.openChanges === 1 ? '' : 's'}`} /> },
            { key: 'g', title: 'Next gate', wrap: true, minWidth: 130, render: r => r.nextGate },
          ]} />
      </VwCard>
    </div>
  );
}

export default ProgrammesPage;
