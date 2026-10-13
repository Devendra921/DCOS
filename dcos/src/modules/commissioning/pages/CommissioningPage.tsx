import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck, Layers } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { Meter } from '../../../ops/ui/status';
import { SOFT, SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';
import { Donut } from '../../../ops/charts/Donut';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { ATP_STATUS, CX_LEVEL } from '../../../mock/data/enums';
import { AtpDetailDrawer } from '../../delivery/components/commissioning';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import type { Project, Atp, AtpStep, Hoto } from '../../../mock/data/types';

const ATP_TONE: Record<string, Tone> = { Draft: 'neutral', 'In Progress': 'warning', Witnessed: 'cyan', Accepted: 'success', Failed: 'error' };

export default function CommissioningPage() {
  const atps = (useEntityList('atps', { pageSize: 1000 }).data?.data ?? []) as unknown as Atp[];
  const atpSteps = (useEntityList('atpSteps', { pageSize: 5000 }).data?.data ?? []) as unknown as AtpStep[];
  const hotos = (useEntityList('hotos', { pageSize: 1000 }).data?.data ?? []) as unknown as Hoto[];
  const projects = (useEntityList('projects', { pageSize: 500 }).data?.data ?? []) as unknown as Project[];
  const projName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const [selAtp, setSelAtp] = useState<Atp | null>(null);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState<string | undefined>();
  const [levelF, setLevelF] = useState<string | undefined>();
  const [systemF, setSystemF] = useState<string | undefined>();
  const [projectF, setProjectF] = useState<string | undefined>();

  const m = useMemo(() => {
    const accepted = atps.filter((a) => a.status === 'Accepted').length;
    const byLevel = CX_LEVEL.map((lvl) => { const inL = atps.filter((a) => a.level === lvl); const acc = inL.filter((a) => a.status === 'Accepted').length; return { lvl, n: inL.length, rate: inL.length ? Math.round((acc / inL.length) * 100) : 0 }; });
    const passRate = atps.length ? Math.round((accepted / atps.length) * 100) : 0;
    const hotoAccepted = hotos.filter((h) => h.status.startsWith('Accepted')).length;
    return { accepted, byLevel, passRate, hotoAccepted };
  }, [atps, hotos]);

  const passById = useMemo(() => {
    const by = new Map<string, { n: number; pass: number }>();
    atpSteps.forEach((s) => { const e = by.get(s.atpId) ?? { n: 0, pass: 0 }; e.n += 1; if (s.result === 'Pass') e.pass += 1; by.set(s.atpId, e); });
    return by;
  }, [atpSteps]);
  const stepsPass = (a: Atp) => { const e = passById.get(a.id); return e && e.n ? Math.round((e.pass / e.n) * 100) : 0; };
  const stepTotals = useMemo(() => { let n = 0, pass = 0; passById.forEach((e) => { n += e.n; pass += e.pass; }); return { n, pass, pct: n ? Math.round((pass / n) * 100) : 0 }; }, [passById]);

  const systems = useMemo(() => [...new Set(atps.map((a) => a.system))].sort(), [atps]);
  const projIds = useMemo(() => [...new Set(atps.map((a) => a.projectId))], [atps]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return atps.filter((a) => (!statusF || a.status === statusF) && (!levelF || a.level === levelF) && (!systemF || a.system === systemF) && (!projectF || a.projectId === projectF)
      && (!s || `${a.name} ${a.system} ${a.level} ${a.status} ${projName[a.projectId] ?? ''}`.toLowerCase().includes(s)));
  }, [atps, q, statusF, levelF, systemF, projectF, projName]);

  const statusParts = ATP_STATUS.map((s) => ({ key: s, label: s, n: atps.filter((a) => a.status === s).length, tone: ATP_TONE[s] })).filter((p) => p.n > 0);
  const failed = atps.filter((a) => a.status === 'Failed').length;
  const hotoPct = hotos.length ? Math.round((m.hotoAccepted / hotos.length) * 100) : 0;

  const cols: Col<Atp>[] = [
    { key: 'name', header: 'Protocol', sort: (r) => r.name, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.atpId}</small></span>
    ) },
    { key: 'project', header: 'Project', wrap: true, sort: (r) => projName[r.projectId] ?? '', render: (r) => (
      <Link className="ent-link" to={`/delivery/projects/${r.projectId}`} onClick={(e) => e.stopPropagation()}>{projName[r.projectId] ?? 'Project'}</Link>
    ) },
    { key: 'system', header: 'System', sort: (r) => r.system, render: (r) => <Chip tone="neutral">{r.system}</Chip> },
    { key: 'level', header: 'Level', sort: (r) => r.level, render: (r) => <Chip tone="info">{r.level}</Chip> },
    { key: 'steps', header: 'Steps passed', sort: (r) => stepsPass(r), render: (r) => { const p = stepsPass(r); return <Meter pct={p} width={72} color={p === 100 ? 'var(--vw-color-emerald-500)' : 'var(--primaryColor500)'} />; } },
    { key: 'status', header: 'Status', sort: (r) => r.status, render: (r) => <Chip tone={ATP_TONE[r.status] ?? 'neutral'} dot>{r.status}</Chip> },
  ];

  return (
    <OpsPage title="Commissioning & Acceptance" description="Acceptance test protocols, level-by-level progress and hand-over for every site."
      actions={<PageDcScopeSelect />}>

      <StatGrid>
        <StatTile label="Protocols" value={atps.length} sub={`${CX_LEVEL.length} test levels`}>
          <Split legend={false} parts={statusParts} onPick={(k) => setStatusF(statusF === k ? undefined : k)} active={statusF} />
        </StatTile>
        <StatTile label="ATPs accepted" value={<>{m.accepted}<small> / {atps.length}</small></>} sub={m.accepted < atps.length ? `${atps.length - m.accepted} still to accept` : 'all accepted'} subTone={m.accepted < atps.length ? 'warn' : undefined}
          onClick={() => setStatusF(statusF === 'Accepted' ? undefined : 'Accepted')} active={statusF === 'Accepted'} />
        <StatTile label="ATP acceptance" value={<>{m.passRate}<small>%</small></>} sub="of protocols accepted">
          <SoftMeter pct={m.passRate} tone={m.passRate >= 80 ? 'success' : 'info'} />
        </StatTile>
        <StatTile label="Steps passed" value={<>{stepTotals.pct}<small>%</small></>} sub={`${stepTotals.pass} of ${stepTotals.n} test steps`}>
          <SoftMeter pct={stepTotals.pct} tone="info" />
        </StatTile>
        <StatTile label="Failed" value={failed} sub={failed ? 'protocols to re-test' : 'no failures'} subTone={failed ? 'bad' : undefined}
          onClick={() => setStatusF(statusF === 'Failed' ? undefined : 'Failed')} active={statusF === 'Failed'} />
        <StatTile label="HOTO accepted" value={<>{m.hotoAccepted}<small> / {hotos.length}</small></>} sub="hand-overs to operations">
          <SoftMeter pct={hotoPct} tone={hotoPct >= 80 ? 'success' : 'info'} />
        </StatTile>
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title="Acceptance by test level" sub="% of protocols accepted per level · click a level to filter" icon={Layers}>
          <BarList max={100} color="var(--vw-color-emerald-500)" items={m.byLevel.map((l) => ({ key: l.lvl, label: l.lvl, sublabel: `${l.n} protocols`, value: l.rate, active: levelF === l.lvl, display: `${l.rate}%`, onClick: () => setLevelF(levelF === l.lvl ? undefined : l.lvl) }))} />
        </Panel>
        <Panel title="Protocols by status" sub={`${atps.length} protocols`} icon={FileCheck}>
          <Donut slices={statusParts.map((p) => ({ key: p.key, label: p.label, value: p.n, color: SOFT[p.tone] }))} centerValue={String(atps.length)} centerLabel="protocols" onPick={(key) => setStatusF(statusF === key ? undefined : key)} activeKey={statusF} />
        </Panel>
      </div>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} onRow={(a) => setSelAtp(a)} defaultSort={{ key: 'name', dir: 'asc' }} pageSize={30}
          toolbar={
            <ListToolbar shown={rows.length} total={atps.length} noun="protocols"
              search={{ value: q, onChange: setQ, placeholder: 'Protocol, project, system' }}
              filters={[
                { id: 'status', label: 'Status', quick: true, value: statusF ?? '', anyLabel: 'Any status', onChange: (v) => setStatusF(v || undefined), options: ATP_STATUS.map((x) => ({ id: x, label: x, count: atps.filter((a) => a.status === x).length })) },
                { id: 'level', label: 'Level', quick: true, value: levelF ?? '', anyLabel: 'Any level', onChange: (v) => setLevelF(v || undefined), options: CX_LEVEL.map((x) => ({ id: x, label: x, count: atps.filter((a) => a.level === x).length })) },
                { id: 'system', label: 'System', value: systemF ?? '', anyLabel: 'Any system', onChange: (v) => setSystemF(v || undefined), options: systems.map((x) => ({ id: x, label: x, count: atps.filter((a) => a.system === x).length })) },
                { id: 'project', label: 'Project', value: projectF ?? '', anyLabel: 'Any project', onChange: (v) => setProjectF(v || undefined), options: projIds.map((id) => ({ id, label: projName[id] ?? id, count: atps.filter((a) => a.projectId === id).length })) },
              ]} />
          } />
      </section>

      <AtpDetailDrawer atp={selAtp} open={!!selAtp} onClose={() => setSelAtp(null)} />
    </OpsPage>
  );
}
