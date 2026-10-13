/* Changes — /changes. The one home of change requests (standard, normal, emergency; one per work order):
   a summary row, then every tab in view: Changes, Calendar, Approvals, Standard changes, Freezes, Policies.
   Old deep links keep working: ?id=CHG-… opens the change, ?id=MW-… opens the calendar on that window,
   ?dc= filters by site, ?status=Pending approval shows changes awaiting approval. */
import { useMemo } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Spin } from 'antd';
import { TabBarV2 } from '../../../shared/components/ux';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { PlusOutlined } from '../../../shared/icons';
import { useAuth } from '../../../core/auth/AuthContext';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type * as T from '../../../mock/data/types';
import { useDeliveryData } from '../../delivery/lib/chain';
import { buildRows, calendarEntries, homeFigures, startOfWeek } from '../lib/model';
import { Figure, SummaryRow } from '../components/kit';
import { ChangesTab } from '../components/home/ChangesTab';
import { CalendarTab } from '../components/home/CalendarTab';
import { ApprovalsTab } from '../components/home/ApprovalsTab';
import { StandardTab } from '../components/home/StandardTab';
import { FreezesTab } from '../components/home/FreezesTab';
import PolicyEnginePage from './PolicyEnginePage';

const TABS = ['changes', 'calendar', 'approvals', 'standard', 'freezes', 'policies'] as const;
type Tab = (typeof TABS)[number];

export default function ChangesHomePage() {
  const d = useDeliveryData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const devicesData = useEntityList('devices', { pageSize: 100000 }).data?.data;
  const rackOfDevice = useMemo(() => new Map(((devicesData ?? []) as unknown as T.Device[]).filter(x => x.rackId).map(x => [x.id, x.rackId!])), [devicesData]);

  const rows = useMemo(() => buildRows(d, user), [d, user]);
  const entries = useMemo(() => calendarEntries(d), [d]);
  const fig = useMemo(() => homeFigures(rows, entries), [rows, entries]);
  const weekIds = useMemo(() => { const w0 = startOfWeek(new Date()).getTime(), w1 = w0 + 7 * 86400e3; return new Set(entries.filter(e => { const t = new Date(e.start).getTime(); return t >= w0 && t < w1 && e.changeId; }).map(e => e.changeId!)); }, [entries]);

  const legacyId = sp.get('id');
  const legacyStatus = sp.get('status');
  if (legacyId && d.ready) {
    if (d.changeRequests.some(c => c.id === legacyId)) return <Navigate to={`/changes/${legacyId}`} replace />;
  }
  if (legacyStatus === 'Pending approval') { const n = new URLSearchParams(sp); n.set('status', 'review'); return <Navigate to={`/changes?${n.toString()}`} replace />; }

  const tabParam = sp.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : legacyId ? 'calendar' : 'changes';
  const go = (t: Tab, extra: Record<string, string> = {}) => { const n = new URLSearchParams(); if (t !== 'changes') n.set('tab', t); for (const [k, v] of Object.entries(extra)) n.set(k, v); setSp(n, { replace: false }); };
  const flag = sp.get('flag');

  if (!d.ready) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;
  const ob = fig.openByClass;
  const waitingAll = rows.filter(r => r.current && !r.mine).length;

  const items = [
    { key: 'changes', label: 'Changes', badge: rows.length, children: tab === 'changes' ? <ChangesTab rows={rows} weekIds={weekIds} /> : null },
    { key: 'calendar', label: 'Calendar', children: tab === 'calendar' ? <CalendarTab entries={entries} freezes={d.changeFreezes} sites={d.dataCenters} rackOfDevice={rackOfDevice} focus={legacyId ?? undefined} /> : null },
    { key: 'approvals', label: 'Approvals', badge: rows.filter(r => r.current).length || undefined, children: tab === 'approvals' ? <ApprovalsTab rows={rows} /> : null },
    { key: 'standard', label: 'Standard changes', badge: d.standardChangeTemplates.length || undefined, children: tab === 'standard' ? <StandardTab d={d} rows={rows} /> : null },
    { key: 'freezes', label: 'Freezes', badge: d.changeFreezes.length || undefined, children: tab === 'freezes' ? <FreezesTab freezes={d.changeFreezes} sites={d.dataCenters} rows={rows} /> : null },
    { key: 'policies', label: 'Policies', children: tab === 'policies' ? <PolicyEnginePage /> : null },
  ];

  return (
    <div className="vw-flex vw-flex-col vw-page-gap">
      <div className="vw-card-section vw-flex vw-justify-between vw-items-center vw-wrap vw-gap-md" style={{ padding: '14px 20px' }}>
        <div style={{ minWidth: 220 }}>
          <div className="vw-page-title" role="heading" aria-level={3}>Changes</div>
          <div className="vw-card-description">Every change to the estate goes through a change request, one for each work order. Standard changes are pre-approved; normal changes go to the weekly change board; emergency changes go to the emergency board and are reviewed afterwards.</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/changes/new')}>Raise a change</Button>
      </div>

      <SummaryRow columns={6}>
        <Figure first label="Open changes" value={fig.open} sub={[ob.Normal && `${ob.Normal} normal`, ob.Standard && `${ob.Standard} standard`, ob.Emergency && `${ob.Emergency} emergency`].filter(Boolean).join(' · ') || 'none open'} onClick={() => go('changes', { status: 'open' })} active={tab === 'changes' && sp.get('status') === 'open'} />
        <Figure label="Awaiting my approval" value={fig.mine} sub={fig.oldestMineDays !== undefined ? `oldest waiting ${fig.oldestMineDays} d` : waitingAll ? `${waitingAll} waiting on other roles` : 'nothing waiting'} tone={fig.mine ? 'warn' : undefined} onClick={() => go('approvals')} active={tab === 'approvals'} />
        <Figure label="Windows this week" value={fig.weekWindows} sub={fig.weekWindows ? `at ${fig.weekSites} site${fig.weekSites === 1 ? '' : 's'}` : 'none booked'} onClick={() => go('calendar')} active={tab === 'calendar'} />
        <Figure label="Emergency awaiting review" value={fig.emergencyReview} sub="review is mandatory" tone={fig.emergencyReview ? 'warn' : undefined} onClick={() => go('changes', { flag: 'review' })} active={flag === 'review'} />
        <Figure label="Changes in a freeze" value={fig.inFreeze} sub={fig.inFreeze ? 'move the window or go emergency' : 'none'} tone={fig.inFreeze ? 'warn' : undefined} onClick={() => go('changes', { flag: 'freeze' })} active={flag === 'freeze'} />
        <Figure label="Failed, last 30 days" value={fig.failed30} sub={`of ${fig.done30} implemented`} tone={fig.failed30 ? 'bad' : undefined} onClick={() => go('changes', { flag: 'failed' })} active={flag === 'failed'} />
      </SummaryRow>

      {/* Every tab is shown; nothing hides behind a "More" menu. */}
      <TabBarV2 items={items} activeKey={tab} onChange={k => go(k as Tab)} primaryCap={items.length + 1} />
    </div>
  );
}
