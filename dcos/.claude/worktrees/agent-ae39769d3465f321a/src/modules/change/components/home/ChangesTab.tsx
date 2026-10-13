/* Changes tab: every change request in one filterable table. Filters live in the URL so the summary
   row and other screens can deep-link (?class=, ?status=, ?site=, ?project=, ?mine=1, ?flag=). */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Input, Select } from 'antd';
import { VwCard } from '../../../../shared/components/ux';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { PlusOutlined, SearchOutlined } from '../../../../shared/icons';
import type * as T from '../../../../mock/data/types';
import { isOpenChange } from '../../../delivery/lib/chain';
import { CHANGE_TYPE_LABEL, STATUS_LABEL, STATUS_ORDER, fmtHours, fmtWhen, siteLabel, type ChangeRow } from '../../lib/model';
import { ClassChip, Muted, Pager, RiskChip, StatusChip } from '../kit';

const PAGE = 25;
const FLAG_LABEL: Record<string, string> = { review: 'Emergency review due', freeze: 'In a freeze', failed: 'Failed in the last 30 days', week: 'Window this week' };

export function ChangesTab({ rows, weekIds }: { rows: ChangeRow[]; weekIds: Set<string> }) {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [page, setPage] = useState(0);
  const [t30] = useState(() => Date.now() - 30 * 86400e3);
  const get = (k: string) => sp.get(k) ?? '';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); setPage(0); };
  const cls = get('class'), status = get('status'), site = get('site') || get('dc'), project = get('project'), mine = get('mine') === '1', flag = get('flag'), q = get('q');

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
      if (flag === 'review' && !(r.cls === 'Emergency' && r.reviewDue)) return false;
      if (flag === 'freeze' && !(r.freeze && isOpenChange(r.c))) return false;
      if (flag === 'failed' && !(r.failed && new Date(r.c.closedAt ?? r.c.implementedAt ?? r.c.updatedAt).getTime() >= t30)) return false;
      if (flag === 'week' && !weekIds.has(r.c.id)) return false;
      return !s || `${r.c.id} ${r.c.title} ${r.c.requestedBy} ${r.wo?.id ?? ''} ${r.project?.name ?? ''} ${siteLabel(r.site)}`.toLowerCase().includes(s);
    }).sort((a, b) => {
      const oa = isOpenChange(a.c) ? 0 : 1, ob = isOpenChange(b.c) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return oa === 0 ? (a.start ?? '9').localeCompare(b.start ?? '9') : (b.start ?? '').localeCompare(a.start ?? '');
    });
  }, [rows, cls, status, site, project, mine, flag, q, weekIds, t30]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const anyFilter = !!(cls || status || site || project || mine || flag || q);
  const count = (pred: (r: ChangeRow) => boolean) => rows.filter(pred).length;

  return (
    <VwCard>
      <div className="vw-flex vw-items-center vw-gap-sm vw-wrap" style={{ marginBottom: 12 }}>
        <Input allowClear prefix={<SearchOutlined />} placeholder="Search id, title, requester, work order" value={q} onChange={e => set('q', e.target.value)} style={{ width: 260 }} aria-label="Search changes" />
        <Select value={cls || 'all'} onChange={v => set('class', v === 'all' ? '' : v)} style={{ width: 150 }} aria-label="Class"
          options={[{ value: 'all', label: 'All classes' }, ...(['Standard', 'Normal', 'Emergency'] as T.ChangeClass[]).map(c => ({ value: c, label: `${c} (${count(r => r.cls === c)})` }))]} />
        <Select value={status || 'all'} onChange={v => set('status', v === 'all' ? '' : v)} style={{ width: 170 }} aria-label="Status"
          options={[{ value: 'all', label: 'Any status' }, { value: 'open', label: `Open (${count(r => isOpenChange(r.c))})` }, { value: 'review', label: `Awaiting approval (${count(r => r.c.status === 'Submitted' || r.c.status === 'UnderReview')})` }, ...STATUS_ORDER.map(s => ({ value: s, label: `${STATUS_LABEL[s]} (${count(r => r.c.status === s)})` }))]} />
        <Select value={site || 'all'} onChange={v => set('site', v === 'all' ? '' : v)} style={{ width: 150 }} aria-label="Site" showSearch optionFilterProp="label"
          options={[{ value: 'all', label: 'All sites' }, ...sites.map(s => ({ value: s.id, label: siteLabel(s) }))]} />
        <Select value={project || 'all'} onChange={v => set('project', v === 'all' ? '' : v)} style={{ width: 200 }} aria-label="Project" showSearch optionFilterProp="label"
          options={[{ value: 'all', label: 'All projects' }, ...projects.map(p => ({ value: p.id, label: p.name }))]} />
        <label className="vw-inline-flex vw-items-center vw-gap-xs" style={{ fontSize: 'var(--vw-font-label-sm)', cursor: 'pointer' }}>
          <input type="checkbox" checked={mine} onChange={e => set('mine', e.target.checked ? '1' : '')} /> Awaiting my approval
        </label>
        {flag && <button type="button" className="nst-btn nst-btn--sm nst-btn--gray" onClick={() => set('flag', '')} title="Remove this filter">{FLAG_LABEL[flag] ?? flag} ×</button>}
        <span style={{ flex: 1 }} />
        {anyFilter && <button type="button" className="nst-btn nst-btn--sm nst-btn--ghost" onClick={() => { setSp(new URLSearchParams(), { replace: true }); setPage(0); }}>Clear filters</button>}
      </div>

      {filtered.length === 0 ? (
        <div className="vw-flex vw-flex-col vw-items-center vw-gap-sm" style={{ padding: '32px 0' }}>
          <div className="vw-card-title">{anyFilter ? 'No change matches these filters' : 'No changes yet'}</div>
          <div className="vw-card-description">{anyFilter ? 'Clear a filter to see more changes.' : 'Raise a change to plan work on the estate. Each change comes with its work order.'}</div>
          {!anyFilter && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/changes/new')}>Raise a change</Button>}
        </div>
      ) : (
        <>
          <div className="nst-table-wrap">
            <table className="nst-table" style={{ width: '100%' }}>
              <thead><tr><th>ID</th><th>Title · type · requester</th><th>Class</th><th>Risk</th><th>Status</th><th>Site</th><th>Project</th><th>Work order</th><th>Window</th></tr></thead>
              <tbody>{shown.map(r => (
                <tr key={r.c.id} className="is-clickable" onClick={() => navigate(`/changes/${r.c.id}`)}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}><Link to={`/changes/${r.c.id}`} onClick={e => e.stopPropagation()}>{r.c.id}</Link></td>
                  <td style={{ whiteSpace: 'normal', minWidth: 240, maxWidth: 360 }}>
                    <div style={{ color: 'var(--vw-color-slate-900)' }}>{r.c.title}</div>
                    <div><Muted size="xs">{CHANGE_TYPE_LABEL[r.c.type] ?? r.c.type} · {r.c.requestedBy}</Muted></div>
                    {(r.mine || r.freeze || r.reviewDue) && <Muted size="xs">{[r.mine && 'Awaiting your approval', r.freeze && isOpenChange(r.c) && `In freeze: ${r.freeze.name}`, r.reviewDue && 'Review due'].filter(Boolean).join(' · ')}</Muted>}
                  </td>
                  <td><ClassChip cls={r.cls} /></td>
                  <td><RiskChip risk={r.c.risk} short /></td>
                  <td><StatusChip status={r.c.status} /></td>
                  <td>{siteLabel(r.site)}</td>
                  <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.project?.name}>{r.project ? <Link to={`/delivery/projects/${r.project.id}`} onClick={e => e.stopPropagation()}>{r.project.name}</Link> : <Muted>—</Muted>}</td>
                  <td>{r.wo ? <Link to={`/delivery/work-orders/${r.wo.id}`} onClick={e => e.stopPropagation()}>{r.wo.id}</Link> : <Muted>none</Muted>}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.start ? <span>{fmtWhen(r.start)}<div><Muted size="xs">{fmtHours(r.start, r.end)}</Muted></div></span> : <Muted>not booked</Muted>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Pager page={page} pages={pages} total={filtered.length} onPage={setPage} />
        </>
      )}
    </VwCard>
  );
}
