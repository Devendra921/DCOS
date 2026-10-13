/* Programmes (/delivery/programs) and Projects (/delivery/projects) tabs of the delivery hub:
   one searchable table each. A programme is driven by its blueprint; each project runs its own
   process, raises work orders, and each work order its change. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FolderKanban, Layers } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Meter } from '../../../ops/ui/status';
import { DcScopeSelect, useDcScope } from '../../../core/scope/DcScope';
import { PROGRAM_STATUS, PROJECT_STATUS, RAG_VALUES } from '../../../mock/data/enums';
import { DELIVERY_STAGES } from '../lib/deliverExec';
import { buildProgrammeRows, type ProgrammeRow, type ProjectRow } from '../components/home/model';
import { useProjectRows } from '../components/home/hooks';
import { PROGRAM_STATUS_TONE, PROJECT_STATUS_TONE, RAG_TONE, STAGE_TONE, opsTone, tone } from '../components/home/tones';
import { fmtMoney, siteNamer } from '../components/workorders/model';

const has = (q: string, ...xs: (string | undefined)[]) => !q || xs.some(x => x?.toLowerCase().includes(q));
const stop = (e: React.MouseEvent) => e.stopPropagation();

type PRow = ProgrammeRow & { id: string };
type JRow = ProjectRow & { id: string };

export function ProgrammesPage() {
  const navigate = useNavigate();
  const { d, x, rows } = useProjectRows();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>();
  const programmes = useMemo(() => buildProgrammeRows(d, d.programs, rows.map(r => r.project), x), [d, x, rows]);
  const ql = q.trim().toLowerCase();
  const shown: PRow[] = programmes.filter(p => has(ql, p.program.name, p.program.id, p.program.ownerName, p.blueprint) && (!status || p.program.status === status)).map(p => ({ ...p, id: p.program.id }));

  const cols: Col<PRow>[] = [
    { key: 'n', header: 'Programme', sort: p => p.program.name, render: p => <span className="cell-2"><span className="vw-card-activity-label">{p.program.name}</span><small>{p.program.progId ?? p.program.id} · {p.program.ownerName}</small></span> },
    { key: 't', header: 'Type and blueprint', sort: p => p.program.type, render: p => <span className="cell-2"><span>{p.program.type}</span><small>{p.blueprint}</small></span> },
    { key: 's', header: 'Status', sort: p => p.program.status, render: p => <Chip tone={opsTone(tone(PROGRAM_STATUS_TONE, p.program.status))} dot>{p.program.status}</Chip> },
    { key: 'pr', header: 'Projects', align: 'right', sort: p => p.projects.length, render: p => <span className="num">{p.projects.length}</span> },
    { key: 'c', header: 'Completion', sort: p => p.completion, render: p => <Meter pct={p.completion} width={96} color="var(--primaryColor500)" /> },
    { key: 'b', header: 'Budget', align: 'right', sort: p => p.ev.bac || p.program.budget || 0, render: p => <span className="num">{fmtMoney(p.ev.bac || p.program.budget)}</span> },
    { key: 'sp', header: 'Spend', align: 'right', sort: p => p.ev.ac, render: p => <span className="num">{fmtMoney(p.ev.ac)}</span> },
    { key: 'pl', header: 'Source plan', render: p => (p.program.plannerPlanId ? <Link to={`/planning/plans/${p.program.plannerPlanId}`} onClick={stop}>{p.plan?.plnId ?? p.program.plannerPlanId}</Link> : <span className="vw-label">created by hand</span>) },
  ];

  return (
    <OpsPage title="Programmes" description="Each programme is driven by its blueprint and groups the projects that deliver it.">
      <section className="vw-card-section dcl-table">
        {!d.ready ? <Empty icon={Layers} title="Loading programmes">Reading the delivery chain…</Empty> : (
          <DataTable rows={shown} cols={cols} onRow={p => navigate(`/delivery/programs/${p.program.id}`)} pageSize={30}
            empty={<Empty icon={Layers} title={programmes.length ? 'No programme matches' : 'No programmes yet'}>
              {programmes.length ? 'Clear the search or the status filter.' : 'Start the build of an approved plan, or create a programme with New programme.'}
            </Empty>}
            toolbar={
              <ListToolbar shown={shown.length} total={programmes.length} noun="programmes"
                search={{ value: q, onChange: setQ, placeholder: 'Programmes, owners, blueprints' }}
                filters={[
                  { id: 'status', label: 'Status', quick: true, value: status ?? '', anyLabel: 'Any status', onChange: v => setStatus(v || undefined), options: PROGRAM_STATUS.map(v => ({ id: v, label: v, count: programmes.filter(p => p.program.status === v).length })) },
                ]} />
            } />
        )}
      </section>
    </OpsPage>
  );
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const { d, rows } = useProjectRows();
  const { dcId } = useDcScope();
  const [q, setQ] = useState('');
  const [programId, setProgramId] = useState<string>();
  const [status, setStatus] = useState<string>();
  // The overview's health matrix links here with ?stage= and ?rag=.
  const [sp] = useSearchParams();
  const [rag, setRag] = useState<string | undefined>(() => sp.get('rag') ?? undefined);
  const [stage, setStage] = useState<string | undefined>(() => sp.get('stage') ?? undefined);
  const site = useMemo(() => siteNamer(d), [d]);
  const ql = q.trim().toLowerCase();
  const shown: JRow[] = rows.filter(r => (dcId === 'all' || r.project.dataCenterId === dcId) && (!programId || r.project.programId === programId) && (!status || r.project.status === status)
    && (!rag || r.project.rag === rag) && (!stage || r.stage === stage) && has(ql, r.project.name, r.project.id, r.project.managerName, r.program?.name, r.project.template)).map(r => ({ ...r, id: r.project.id }));
  const filtered = !!(ql || programId || status || rag || stage || dcId !== 'all');

  const cols: Col<JRow>[] = [
    { key: 'n', header: 'Project', sort: r => r.project.name, render: r => <span className="cell-2"><span className="vw-card-activity-label">{r.project.name}</span><small>{r.project.projId ?? r.project.id} · {r.project.managerName}</small></span> },
    { key: 'pg', header: 'Programme', sort: r => r.program?.name ?? '', render: r => <span className="cell-2"><span>{r.program?.name ?? <span className="vw-label">none</span>}</span><small>{r.project.template ?? 'no template'}</small></span> },
    { key: 'st', header: 'Stage', sort: r => r.stage, render: r => <Chip tone={opsTone(tone(STAGE_TONE, r.stage))} dot>{r.stage}</Chip> },
    { key: 'rag', header: 'RAG and status', sort: r => r.project.rag, render: r => <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}><Chip tone={opsTone(tone(RAG_TONE, r.project.rag))} dot>{r.project.rag}</Chip>{r.project.status !== 'Active' && <Chip tone={opsTone(tone(PROJECT_STATUS_TONE, r.project.status))}>{r.project.status}</Chip>}</span> },
    { key: 'c', header: 'Done', sort: r => r.project.percentComplete, render: r => <Meter pct={r.project.percentComplete} width={64} color="var(--primaryColor500)" /> },
    { key: 'si', header: 'Site', sort: r => site(r.project.dataCenterId), render: r => site(r.project.dataCenterId) },
    { key: 'open', header: 'Open work', sort: r => r.openWorkOrders, render: r => <span className="cell-2"><span className="num">{r.openWorkOrders} work order{r.openWorkOrders === 1 ? '' : 's'}</span><small>{r.openChanges} change{r.openChanges === 1 ? '' : 's'}</small></span> },
    { key: 'g', header: 'Next gate', wrap: true, render: r => r.nextGate },
  ];

  return (
    <OpsPage title="Projects" description="Each project runs its own process, raises work orders, and each work order its change.">
      <section className="vw-card-section dcl-table">
        {!d.ready ? <Empty icon={FolderKanban} title="Loading projects">Reading the delivery chain…</Empty> : (
          <DataTable rows={shown} cols={cols} onRow={r => navigate(`/delivery/projects/${r.project.id}`)} pageSize={30}
            empty={<Empty icon={FolderKanban} title={filtered ? 'No project matches' : 'No projects yet'}>
              {filtered ? 'Clear the search or the filters.' : 'Projects are created when a programme starts its phases, or with New project.'}
            </Empty>}
            toolbar={
              <ListToolbar shown={shown.length} total={rows.length} noun="projects"
                search={{ value: q, onChange: setQ, placeholder: 'Projects, managers, templates' }}
                filters={[
                  { id: 'programme', label: 'Programme', quick: true, value: programId ?? '', anyLabel: 'All programmes', onChange: v => setProgramId(v || undefined), options: d.programs.map(p => ({ id: p.id, label: p.name, count: rows.filter(r => r.project.programId === p.id).length })) },
                  { id: 'status', label: 'Status', quick: true, value: status ?? '', anyLabel: 'Any status', onChange: v => setStatus(v || undefined), options: PROJECT_STATUS.map(v => ({ id: v, label: v, count: rows.filter(r => r.project.status === v).length })) },
                  { id: 'rag', label: 'RAG', value: rag ?? '', anyLabel: 'Any RAG', onChange: v => setRag(v || undefined), options: RAG_VALUES.map(v => ({ id: v, label: v, count: rows.filter(r => r.project.rag === v).length })) },
                  { id: 'stage', label: 'Stage', value: stage ?? '', anyLabel: 'Any stage', onChange: v => setStage(v || undefined), options: DELIVERY_STAGES.map(v => ({ id: v, label: v, count: rows.filter(r => r.stage === v).length })) },
                ]}>
                <DcScopeSelect />
              </ListToolbar>
            } />
        )}
      </section>
    </OpsPage>
  );
}

export default ProgrammesPage;
