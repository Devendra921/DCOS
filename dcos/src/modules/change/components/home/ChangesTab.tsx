/* Changes tab: every change request in one filterable table. Filters live in the URL so the overview
   and other screens can deep-link (?class=, ?status=, ?site=, ?project=, ?mine=1, ?risk=, ?type=,
   ?role= (approver role the change waits on), ?std= (standard template), ?flag= with ?from=YYYY-MM-DD
   for the dated flags done and failed). Flags are defined with the overview (lib/overview.ts). The
   Materials column shows the availability of the change's items still to come (advisory). */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, SearchX } from 'lucide-react';
import type * as T from '../../../../mock/data/types';
import { Btn, Empty } from '../../../../ops/ui/kit';
import { DataTable, type Col } from '../../../../ops/ui/DataTable';
import { ListToolbar, type ListFilter } from '../../../../ops/ui/ListToolbar';
import { isOpenChange } from '../../../delivery/lib/chain';
import { CHANGE_TYPE_LABEL, RISKS, STATUS_LABEL, STATUS_ORDER, fmtDay, fmtHours, fmtWhen, roleLabel, siteLabel, type ChangeRow } from '../../lib/model';
import { FLAG_LABEL, isHighRisk, matchesFlag, parseDateParam } from '../../lib/overview';
import { ClassChip, Muted, RiskChip, StatusChip } from '../kit';
import { AvailabilityChip } from '../ChangeMaterials';
import type { AvailabilityView } from '../../../delivery/lib/materialRules';

/** `idFlags`: `?flag=` values that are sets of change ids worked out by the page (next 14 days, clashes, …). */
export function ChangesTab({ rows, weekIds, idFlags, availabilityOf }: { rows: ChangeRow[]; weekIds: Set<string>; idFlags?: Record<string, Set<string>>; availabilityOf?: (c: ChangeRow['c']) => AvailabilityView | undefined }) {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [now] = useState(() => Date.now());
  const get = (k: string) => sp.get(k) ?? '';
  // Filters live in the URL. Stay on this tab when the last filter is removed (a bare /changes opens the overview).
  const patch = (p: Record<string, string>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(p)) {
      if (v) n.set(k, v); else n.delete(k);
      if (k === 'flag' && !v) n.delete('from');
      if (k === 'site') n.delete('dc');
    }
    n.set('tab', 'changes'); setSp(n, { replace: true });
  };
  const set = (k: string) => (v: string) => patch({ [k]: v });
  const cls = get('class'), status = get('status'), site = get('site') || get('dc'), project = get('project'), mine = get('mine') === '1', flag = get('flag'), q = get('q');
  const risk = get('risk'), type = get('type'), role = get('role'), std = get('std'), fromParam = get('from');
  const from = parseDateParam(fromParam);
  const flagCtx = useMemo(() => ({ now, from, ids: { week: weekIds, ...idFlags } }), [now, from, weekIds, idFlags]);

  const sites = useMemo(() => [...new Map(rows.filter(r => r.site).map(r => [r.site!.id, r.site!])).values()].sort((a, b) => siteLabel(a).localeCompare(siteLabel(b))), [rows]);
  const projects = useMemo(() => [...new Map(rows.filter(r => r.project).map(r => [r.project!.id, r.project!])).values()].sort((a, b) => a.name.localeCompare(b.name)), [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      if (cls && r.cls !== cls) return false;
      if (status === 'open' ? !isOpenChange(r.c) : status === 'review' ? !(r.c.status === 'Submitted' || r.c.status === 'UnderReview') : status && r.c.status !== status) return false;
      if (site && r.site?.id !== site) return false;
      if (project && r.project?.id !== project) return false;
      if (mine && !r.mine) return false;
      if (risk && (risk === 'high' ? !isHighRisk(r.c) : r.c.risk !== risk)) return false;
      if (type && r.c.type !== type) return false;
      if (role && r.current?.approverRole !== role) return false;
      if (std && r.c.standardTemplateId !== std) return false;
      if (flag && !matchesFlag(flag, r, flagCtx)) return false;
      return !s || `${r.c.id} ${r.c.title} ${r.c.requestedBy} ${r.wo?.id ?? ''} ${r.project?.name ?? ''} ${siteLabel(r.site)}`.toLowerCase().includes(s);
    }).sort((a, b) => {
      const oa = isOpenChange(a.c) ? 0 : 1, ob = isOpenChange(b.c) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return oa === 0 ? (a.start ?? '9').localeCompare(b.start ?? '9') : (b.start ?? '').localeCompare(a.start ?? '');
    }).map(r => ({ ...r, id: r.c.id }));
  }, [rows, cls, status, site, project, mine, flag, q, risk, type, role, std, flagCtx]);

  const anyFilter = !!(cls || status || site || project || mine || flag || q || risk || type || role || std);
  const count = (pred: (r: ChangeRow) => boolean) => rows.filter(pred).length;
  const flagLabel = (f: string) => `${FLAG_LABEL[f] ?? f}${from && (f === 'done' || f === 'failed') ? ` since ${fmtDay(new Date(from).toISOString())}` : f === 'failed' ? ', last 30 days' : f === 'done' ? ', last 28 days' : ''}`;
  const roles = useMemo(() => [...new Set(rows.map(r => r.current?.approverRole as string | undefined).filter((x): x is string => !!x))].sort(), [rows]);
  const templates = useMemo(() => [...new Map(rows.filter(r => r.template).map(r => [r.template!.id, r.template!])).values()].sort((a, b) => a.name.localeCompare(b.name)), [rows]);
  const withCurrent = (opts: { id: string; label: string; count?: number }[], v: string, label: string) => (v && !opts.some(o => o.id === v) ? [...opts, { id: v, label }] : opts);

  const filters: ListFilter[] = [
    { id: 'class', label: 'Class', quick: true, value: cls, anyLabel: 'All classes', onChange: set('class'), options: (['Standard', 'Normal', 'Emergency'] as T.ChangeClass[]).map(c => ({ id: c, label: c, count: count(r => r.cls === c) })) },
    { id: 'status', label: 'Status', quick: true, value: status, anyLabel: 'Any status', onChange: set('status'), options: [{ id: 'open', label: 'Open', count: count(r => isOpenChange(r.c)) }, { id: 'review', label: 'Awaiting approval', count: count(r => r.c.status === 'Submitted' || r.c.status === 'UnderReview') }, ...STATUS_ORDER.map(s => ({ id: s, label: STATUS_LABEL[s], count: count(r => r.c.status === s) }))] },
    { id: 'risk', label: 'Risk', value: risk, anyLabel: 'Any risk', onChange: set('risk'), options: [{ id: 'high', label: 'High or critical', count: count(r => isHighRisk(r.c)) }, ...RISKS.map(k => ({ id: k, label: k, count: count(r => r.c.risk === k) }))] },
    { id: 'site', label: 'Site', value: site, anyLabel: 'All sites', onChange: set('site'), options: sites.map(s => ({ id: s.id, label: siteLabel(s) })) },
    { id: 'project', label: 'Project', value: project, anyLabel: 'All projects', onChange: set('project'), options: projects.map(p => ({ id: p.id, label: p.name })) },
    { id: 'mine', label: 'Approver', value: mine ? '1' : '', anyLabel: 'Anyone', onChange: set('mine'), options: [{ id: '1', label: 'Awaiting my approval', count: count(r => r.mine) }] },
    { id: 'flag', label: 'Flag', value: flag, anyLabel: 'No flag', onChange: set('flag'), options: withCurrent(Object.keys(FLAG_LABEL).map(f => ({ id: f, label: flag === f ? flagLabel(f) : FLAG_LABEL[f] })), flag, flagLabel(flag)) },
    { id: 'type', label: 'Type', value: type, anyLabel: 'Any type', onChange: set('type'), options: withCurrent(Object.entries(CHANGE_TYPE_LABEL).map(([k, l]) => ({ id: k, label: l, count: count(r => r.c.type === k) })), type, type) },
    { id: 'role', label: 'Waiting for', value: role, anyLabel: 'Any approver role', onChange: set('role'), options: withCurrent(roles.map(x => ({ id: x, label: roleLabel(x) })), role, roleLabel(role)) },
    { id: 'std', label: 'Template', value: std, anyLabel: 'Any template', onChange: set('std'), options: withCurrent(templates.map(t => ({ id: t.id, label: t.name })), std, std) },
  ];

  type Row = ChangeRow & { id: string };
  const cols: Col<Row>[] = [
    { key: 'id', header: 'Change', sort: r => r.c.id, wrap: true, render: r => (
      <span className="cell-2">
        <span className="vw-card-activity-label"><Link className="ent-link mono" to={`/changes/${r.c.id}`} onClick={e => e.stopPropagation()}>{r.c.id}</Link> {r.c.title}</span>
        <small>{CHANGE_TYPE_LABEL[r.c.type] ?? r.c.type} · {r.c.requestedBy}{(r.mine || r.freeze || r.reviewDue) ? ` · ${[r.mine && 'Awaiting your approval', r.freeze && isOpenChange(r.c) && `In freeze: ${r.freeze.name}`, r.reviewDue && 'Review due'].filter(Boolean).join(' · ')}` : ''}</small>
      </span>
    ) },
    { key: 'class', header: 'Class', sort: r => r.cls, render: r => <ClassChip cls={r.cls} /> },
    { key: 'risk', header: 'Risk', sort: r => RISKS.indexOf(r.c.risk as typeof RISKS[number]), render: r => <RiskChip risk={r.c.risk} short /> },
    { key: 'status', header: 'Status', sort: r => STATUS_ORDER.indexOf(r.c.status), render: r => <StatusChip status={r.c.status} /> },
    { key: 'site', header: 'Site', sort: r => siteLabel(r.site), render: r => (
      <span className="cell-2"><span>{siteLabel(r.site)}</span><small title={r.project?.name}>{r.project ? <Link to={`/delivery/projects/${r.project.id}`} onClick={e => e.stopPropagation()}>{r.project.name}</Link> : 'no project'}</small></span>
    ) },
    { key: 'wo', header: 'Work order', sort: r => r.wo?.id ?? '', render: r => (r.wo ? <Link className="ent-link mono" to={`/delivery/work-orders/${r.wo.id}`} onClick={e => e.stopPropagation()}>{r.wo.id}</Link> : <Muted>none</Muted>) },
    ...(availabilityOf ? [{ key: 'mat', header: 'Materials', render: (r: Row) => { const a = isOpenChange(r.c) ? availabilityOf(r.c) : undefined; return a && a.open ? <span title={a.reasons.join(' · ') || undefined}><AvailabilityChip a={a} short /></span> : <Muted>—</Muted>; } }] : []),
    { key: 'window', header: 'Window', sort: r => r.start ?? '', render: r => (r.start
      ? <span className="cell-2"><span className="num">{fmtWhen(r.start)}</span><small>{fmtHours(r.start, r.end)}</small></span>
      : <Muted>not booked</Muted>) },
  ];

  const empty = anyFilter
    ? <Empty icon={SearchX} title="No change matches these filters" action={<Btn size="xs" onClick={() => setSp(new URLSearchParams({ tab: 'changes' }), { replace: true })}>Clear filters</Btn>}>Clear a filter to see more changes.</Empty>
    : <Empty icon={Plus} title="No changes yet" action={<Btn size="xs" variant="filled" icon={Plus} onClick={() => navigate('/changes/new')}>Raise a change</Btn>}>Raise a change to plan work on the estate. Each change comes with its work order.</Empty>;

  return (
    <section className="vw-card-section dcl-table">
      <DataTable<Row> rows={filtered} cols={cols} onRow={r => navigate(`/changes/${r.c.id}`)} pageSize={25} empty={empty}
        toolbar={
          <ListToolbar shown={filtered.length} total={rows.length} noun="changes"
            search={{ value: q, onChange: set('q'), placeholder: 'Search id, title, requester, work order' }}
            filters={filters} onApply={patch} />
        } />
    </section>
  );
}
