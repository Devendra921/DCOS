/* Changes — /changes. The one home of change requests (standard, normal, emergency; one per work order):
   the module header, then every tab in view: Overview (the default: trends, pipeline, the next 14 days,
   where changes fail), Changes, Calendar, Freezes, Policies.
   Old deep links keep working: ?id=CHG-… opens the change, ?id=MW-… opens the calendar on that window,
   ?dc= filters by site, ?status=Pending approval shows changes awaiting approval; any Changes-tab
   filter without ?tab= opens the Changes tab. */
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Spin } from 'antd';
import { Plus } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Tabs } from '../../../ops/ui/kit';
import { useAuth } from '../../../core/auth/AuthContext';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type * as T from '../../../mock/data/types';
import { useDeliveryData } from '../../delivery/lib/chain';
import { useMaterialData } from '../../delivery/lib/materialHooks';
import { kitIndex } from '../../delivery/components/home/model';
import { buildRows, calendarEntries, startOfWeek } from '../lib/model';
import { buildOverview, overviewIdFlags } from '../lib/overview';
import { availabilityIndex, materialsShort as isShort } from '../lib/materialIndex';
import { OverviewTab } from '../components/overview/OverviewTab';
import { ChangesTab } from '../components/home/ChangesTab';
import { CalendarTab } from '../components/home/CalendarTab';
import { FreezesTab } from '../components/home/FreezesTab';
import PolicyEnginePage from './PolicyEnginePage';

const TABS = ['overview', 'changes', 'calendar', 'freezes', 'policies'] as const;
type Tab = (typeof TABS)[number];
/** URL parameters read by the Changes tab: with any of them and no ?tab=, the Changes tab opens. */
const CHANGE_FILTERS = ['class', 'status', 'site', 'dc', 'project', 'mine', 'flag', 'from', 'q', 'risk', 'type', 'role', 'std'];

export default function ChangesHomePage() {
  const d = useDeliveryData();
  const md = useMaterialData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [now] = useState(() => Date.now());
  const devicesData = useEntityList('devices', { pageSize: 100000 }).data?.data;
  const rackOfDevice = useMemo(() => new Map(((devicesData ?? []) as unknown as T.Device[]).filter(x => x.rackId).map(x => [x.id, x.rackId!])), [devicesData]);

  const rows = useMemo(() => buildRows(d, user), [d, user]);
  const entries = useMemo(() => calendarEntries(d), [d]);
  const weekIds = useMemo(() => { const w0 = startOfWeek(new Date(now)).getTime(), w1 = w0 + 7 * 86400e3; return new Set(entries.filter(e => { const t = new Date(e.start).getTime(); return t >= w0 && t < w1 && e.changeId; }).map(e => e.changeId!)); }, [entries, now]);
  // Kit readiness is advisory: a short kit is flagged, never blocking.
  const kitShort = useMemo(() => kitIndex(md.materialLines, now).change, [md.materialLines, now]);
  // Material availability from the supply chain platform's last answer: advisory, flagged when short.
  const availOf = useMemo(() => availabilityIndex(md.materialLines), [md.materialLines]);
  const materialsShort = useMemo(() => (c: T.ChangeRequest) => isShort(availOf(c)), [availOf]);
  const overview = useMemo(() => buildOverview({ d, rows, entries, now, rackOfDevice, kitShort, materialsShort }), [d, rows, entries, now, rackOfDevice, kitShort, materialsShort]);
  const idFlags = useMemo(() => overviewIdFlags(overview), [overview]);

  const legacyId = sp.get('id');
  const legacyStatus = sp.get('status');
  if (legacyId && d.ready) {
    if (d.changeRequests.some(c => c.id === legacyId)) return <Navigate to={`/changes/${legacyId}`} replace />;
  }
  if (legacyStatus === 'Pending approval') { const n = new URLSearchParams(sp); n.set('status', 'review'); return <Navigate to={`/changes?${n.toString()}`} replace />; }

  // The Approvals and Standard changes tabs were removed; their links open the filtered change list.
  if (sp.get('tab') === 'approvals') return <Navigate to="/changes?status=review" replace />;
  if (sp.get('tab') === 'standard') { const t = sp.get('template'); return <Navigate to={t ? `/changes?std=${encodeURIComponent(t)}` : '/changes?class=Standard'} replace />; }
  const tabParam = sp.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : legacyId ? 'calendar' : CHANGE_FILTERS.some(k => sp.has(k)) ? 'changes' : 'overview';
  const go = (t: Tab) => { const n = new URLSearchParams(); if (t !== 'overview') n.set('tab', t); setSp(n, { replace: false }); };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'changes', label: 'Changes', count: d.ready ? rows.length : undefined },
    { id: 'calendar', label: 'Calendar' },
    { id: 'freezes', label: 'Freezes', count: d.changeFreezes.length || undefined },
    { id: 'policies', label: 'Policies' },
  ];
  const body = () => {
    switch (tab) {
      case 'overview': return <OverviewTab o={overview} kitShort={kitShort} />;
      case 'changes': return <ChangesTab rows={rows} weekIds={weekIds} idFlags={idFlags} availabilityOf={availOf} />;
      case 'calendar': return <CalendarTab entries={entries} freezes={d.changeFreezes} sites={d.dataCenters} rackOfDevice={rackOfDevice} focus={legacyId ?? undefined} />;
      case 'freezes': return <FreezesTab freezes={d.changeFreezes} sites={d.dataCenters} rows={rows} />;
      case 'policies': return <PolicyEnginePage />;
    }
  };

  return (
    <OpsPage title="Change management" description="Every change to the estate goes through a change request, one for each work order. Standard changes are pre-approved; normal changes go to the weekly change board; emergency changes go to the emergency board and are reviewed afterwards."
      actions={<Btn variant="filled" icon={Plus} onClick={() => navigate('/changes/new')}>Raise a change</Btn>}>
      {/* Every tab is shown; nothing hides behind a "More" menu. */}
      <Tabs<Tab> value={tab} onChange={go} tabs={tabs} />
      {d.ready ? body() : <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>}
    </OpsPage>
  );
}
