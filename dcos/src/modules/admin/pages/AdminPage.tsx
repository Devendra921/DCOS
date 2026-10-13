import { useMemo, useState } from 'react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';

const PERSPECTIVES = [
  { code: 'R01', label: 'Administrator', tier: 'system', authority: 'admin', density: 'standard', home: '/' },
  { code: 'R02', label: 'Executive', tier: 'strategic', authority: 'govern', density: 'comfortable', home: '/' },
  { code: 'R03', label: 'Facility / DC Manager', tier: 'management', authority: 'govern', density: 'standard', home: '/facility' },
  { code: 'R04', label: 'Capacity Planner', tier: 'engineering', authority: 'contribute', density: 'expert', home: '/capacity' },
  { code: 'R05', label: 'Network Engineer', tier: 'engineering', authority: 'contribute', density: 'expert', home: '/ipam' },
  { code: 'R06', label: 'Delivery Manager', tier: 'management', authority: 'approve', density: 'standard', home: '/delivery' },
  { code: 'R07', label: 'Change Approver', tier: 'management', authority: 'govern', density: 'standard', home: '/change' },
  { code: 'R08', label: 'NOC / Operations', tier: 'operations', authority: 'contribute', density: 'expert', home: '/nms' },
  { code: 'R09', label: 'Field Technician', tier: 'field', authority: 'contribute', density: 'comfortable', home: '/build' },
  { code: 'R10', label: 'Compliance Auditor', tier: 'external', authority: 'view', density: 'standard', home: '/compliance' },
];

type Perspective = (typeof PERSPECTIVES)[number] & { id: string };
const ROWS: Perspective[] = PERSPECTIVES.map((p) => ({ ...p, id: p.code }));
const uniq = (k: 'tier' | 'authority') => [...new Set(PERSPECTIVES.map((p) => p[k]))];

const cols: Col<Perspective>[] = [
  { key: 'label', header: 'Perspective', sort: (r) => r.code, render: (r) => (
    <span className="cell-2"><span className="vw-card-activity-label">{r.label}</span><small className="mono">{r.code}</small></span>
  ) },
  { key: 'tier', header: 'Tier', sort: (r) => r.tier, render: (r) => <Chip>{r.tier}</Chip> },
  { key: 'authority', header: 'Authority', sort: (r) => r.authority, render: (r) => <Chip tone={r.authority === 'admin' || r.authority === 'govern' ? 'error' : r.authority === 'approve' ? 'orange' : 'info'} dot>{r.authority}</Chip> },
  { key: 'density', header: 'Density', sort: (r) => r.density, render: (r) => r.density },
  { key: 'home', header: 'Home', sort: (r) => r.home, render: (r) => <span className="mono">{r.home}</span> },
];

export default function AdminPage() {
  const [q, setQ] = useState('');
  const [tierF, setTierF] = useState('');
  const [authF, setAuthF] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ROWS.filter((r) => (!tierF || r.tier === tierF) && (!authF || r.authority === authF)
      && (!s || `${r.code} ${r.label} ${r.home}`.toLowerCase().includes(s)));
  }, [q, tierF, authF]);

  return (
    <OpsPage title="Administration" description="Perspectives and capabilities — 10 role perspectives drive navigation breadth, UI density, capabilities, and AI tone. Currently running single-admin in the prototype.">
      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} defaultSort={{ key: 'label', dir: 'asc' }}
          toolbar={
            <ListToolbar shown={rows.length} total={ROWS.length} noun="perspectives"
              search={{ value: q, onChange: setQ, placeholder: 'Perspective, code, home' }}
              filters={[
                { id: 'tier', label: 'Tier', quick: true, value: tierF, anyLabel: 'Any tier', onChange: setTierF, options: uniq('tier').map((t) => ({ id: t, label: t, count: ROWS.filter((r) => r.tier === t).length })) },
                { id: 'authority', label: 'Authority', quick: true, value: authF, anyLabel: 'Any authority', onChange: setAuthF, options: uniq('authority').map((a) => ({ id: a, label: a, count: ROWS.filter((r) => r.authority === a).length })) },
              ]} />
          } />
      </section>
    </OpsPage>
  );
}
