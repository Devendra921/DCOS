import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, ShieldAlert } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { ListToolbar } from '../../../ops/ui/ListToolbar';
import { SOFT, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';
import { Donut } from '../../../ops/charts/Donut';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import type { Rack, VLAN, Subnet, Device, DataCenter } from '../../../mock/data/types';
import { dcTypeProfile, dcTypeFit, fmtPowerRange } from '../../../mock/data/dcTypes';

const SEVS = ['High', 'Medium', 'Low'] as const;
const SEV_TONE: Record<string, Tone> = { High: 'error', Medium: 'orange', Low: 'info' };

interface Finding { key: string; category: string; resource: string; recommendation: string; saving: string; sev: 'High' | 'Medium' | 'Low'; to?: string }

export default function OptimizationHubPage() {
  const navigate = useNavigate();
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const vlans = (useEntityList('vlans', { pageSize: 500 }).data?.data ?? []) as unknown as VLAN[];
  const subnets = (useEntityList('subnets', { pageSize: 500 }).data?.data ?? []) as unknown as Subnet[];
  const assets = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];

  const findings = useMemo<Finding[]>(() => {
    const out: Finding[] = [];
    racks.filter((r) => r.powerUtilizationPct < 25 && r.usedU > 0).slice(0, 8).forEach((r) =>
      out.push({ key: 'ur-' + r.id, category: 'Underutilized rack', resource: r.name, recommendation: `Consolidate — only ${r.powerUtilizationPct}% power used`, saving: `${Math.round(r.maxPowerKw - r.currentPowerKw)} kW reclaimable`, sev: 'Medium', to: `/facility/racks/${r.id}` }));
    racks.filter((r) => r.purpose === 'GPU' && !r.liquidCoolingReady).slice(0, 6).forEach((r) =>
      out.push({ key: 'lc-' + r.id, category: 'Cooling readiness', resource: r.name, recommendation: 'GPU rack lacks liquid-cooling readiness for >40 kW density', saving: 'Density constraint', sev: 'High', to: `/facility/racks/${r.id}` }));
    const unused = vlans.filter((v) => v.status === 'Unused');
    if (unused.length) out.push({ key: 'vlan', category: 'Network optimization', resource: `${unused.length} VLANs`, recommendation: 'Reclaim unused VLAN IDs', saving: `${unused.length} IDs`, sev: 'Low', to: '/ipam/vlans' });
    subnets.filter((s) => s.utilizationPct >= 85).slice(0, 5).forEach((s) =>
      out.push({ key: 'sn-' + s.id, category: 'Subnet exhaustion', resource: s.cidr, recommendation: `${s.utilizationPct}% used — plan expansion`, saving: 'Avoid outage', sev: 'High', to: `/ipam/subnets/${s.id}` }));
    // Profile fit: a site running outside its type's density or power envelope is either mis-classified or under-provisioned.
    dcs.forEach((d) => {
      const t = dcTypeProfile(d.dcTypeKey); if (!t) return;
      const rk = racks.filter((r) => r.dataCenterId === d.id);
      const avg = rk.length ? rk.reduce((s, r) => s + r.maxPowerKw, 0) / rk.length : 0;
      const fit = dcTypeFit(t, { racks: rk.length, designPowerKw: d.designPowerKw, avgMaxKwPerRack: avg });
      if (fit.density === 'above') out.push({ key: 'fit-d-' + d.id, category: 'Profile fit', resource: d.name, recommendation: `Density ${avg.toFixed(1)} kW/rack is above the ${t.name} band (${t.kwPerRack?.[0]}–${t.kwPerRack?.[1]}) — upgrade cooling or reclassify the site`, saving: 'Thermal risk', sev: 'High', to: `/facility/dc/${d.id}` });
      if (fit.power !== 'within') out.push({ key: 'fit-p-' + d.id, category: 'Profile fit', resource: d.name, recommendation: `Design power ${d.designPowerKw.toLocaleString()} kW is ${fit.power} the ${t.name} envelope (${fmtPowerRange(t.powerKw)})`, saving: fit.power === 'below' ? 'Stranded capacity risk' : 'Reclassify', sev: 'Medium', to: `/facility/dc/${d.id}` });
    });
    const idle = assets.filter((a) => ['Retired', 'Disposed'].includes(a.lifecycleState ?? '') && a.rackId).length;
    if (idle) out.push({ key: 'idle', category: 'Idle assets', resource: `${idle} devices`, recommendation: 'Retired/disposed devices still occupying rack U', saving: 'Reclaim U + power', sev: 'Medium', to: '/facility/devices' });
    return out;
  }, [racks, vlans, subnets, assets, dcs]);

  const byCat = (c: string) => findings.filter((f) => f.category === c).length;
  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('');
  const [sevF, setSevF] = useState('');

  const all = useMemo(() => findings.map((f) => ({ ...f, id: f.key })), [findings]);
  const categories = useMemo(() => [...new Set(findings.map((f) => f.category))], [findings]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((f) => (!catF || f.category === catF) && (!sevF || f.sev === sevF)
      && (!s || `${f.category} ${f.resource} ${f.recommendation} ${f.saving}`.toLowerCase().includes(s)));
  }, [all, q, catF, sevF]);

  const sevParts = SEVS.map((s) => ({ key: s, label: s, n: findings.filter((f) => f.sev === s).length, tone: SEV_TONE[s] }));
  const high = findings.filter((f) => f.sev === 'High').length;
  const capacity = byCat('Underutilized rack') + byCat('Idle assets');
  const network = byCat('Network optimization') + byCat('Subnet exhaustion');
  const catItems = categories.map((c) => ({ key: c, label: c, active: catF === c, sublabel: `${findings.filter((f) => f.category === c && f.sev === 'High').length} high`, value: byCat(c), onClick: () => setCatF(catF === c ? '' : c) })).sort((a, b) => b.value - a.value);

  const cols: Col<Finding & { id: string }>[] = [
    { key: 'resource', header: 'Resource', sort: (r) => r.resource, render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{r.resource}</span><small>{r.category}</small></span>
    ) },
    { key: 'recommendation', header: 'Recommendation', wrap: true, render: (r) => r.recommendation },
    { key: 'saving', header: 'Opportunity', sort: (r) => r.saving, render: (r) => r.saving },
    { key: 'sev', header: 'Priority', sort: (r) => SEVS.indexOf(r.sev), render: (r) => <Chip tone={SEV_TONE[r.sev]} dot>{r.sev}</Chip> },
  ];

  return (
    <OpsPage title="Optimization" description="Savings and efficiency opportunities ranked by impact across power, cooling, capacity and cost."
      actions={<PageDcScopeSelect />}>

      <StatGrid>
        <StatTile label="Total findings" value={findings.length} sub={`${categories.length} categories`}>
          <Split legend={false} parts={sevParts} onPick={(k) => setSevF(sevF === k ? '' : k)} active={sevF} />
        </StatTile>
        <StatTile label="High priority" value={high} sub={high ? 'act on these first' : 'none high'} subTone={high ? 'bad' : undefined}
          onClick={() => setSevF(sevF === 'High' ? '' : 'High')} active={sevF === 'High'} />
        <StatTile label="Capacity" value={capacity} sub="underused racks, idle assets" />
        <StatTile label="Network" value={network} sub="VLANs and subnets" />
        <StatTile label="Cooling readiness" value={byCat('Cooling readiness')} sub="GPU racks without liquid cooling" subTone={byCat('Cooling readiness') ? 'warn' : undefined}
          onClick={() => setCatF(catF === 'Cooling readiness' ? '' : 'Cooling readiness')} active={catF === 'Cooling readiness'} />
        <StatTile label="Profile fit" value={byCat('Profile fit')} sub="sites outside their type envelope" subTone={byCat('Profile fit') ? 'warn' : undefined}
          onClick={() => setCatF(catF === 'Profile fit' ? '' : 'Profile fit')} active={catF === 'Profile fit'} />
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title="Findings by category" sub="Click a category to filter the findings" icon={Lightbulb}>
          <BarList items={catItems} />
        </Panel>
        <Panel title="Findings by priority" sub={`${findings.length} findings`} icon={ShieldAlert}>
          <Donut slices={sevParts.filter((p) => p.n > 0).map((p) => ({ key: p.key, label: p.label, value: p.n, color: SOFT[p.tone] }))} centerValue={String(findings.length)} centerLabel="findings" onPick={(key) => setSevF(sevF === key ? '' : key)} activeKey={sevF} />
        </Panel>
      </div>

      <section className="vw-card-section dcl-table">
        <DataTable rows={rows} cols={cols} onRow={(f) => { if (f.to) navigate(f.to); }} defaultSort={{ key: 'sev', dir: 'asc' }} pageSize={30}
          toolbar={
            <ListToolbar shown={rows.length} total={findings.length} noun="findings"
              search={{ value: q, onChange: setQ, placeholder: 'Resource, recommendation' }}
              filters={[
                { id: 'category', label: 'Category', quick: true, value: catF, anyLabel: 'Any category', onChange: setCatF, options: categories.map((c) => ({ id: c, label: c, count: byCat(c) })) },
                { id: 'sev', label: 'Priority', quick: true, value: sevF, anyLabel: 'Any priority', onChange: setSevF, options: SEVS.map((s) => ({ id: s, label: s, count: findings.filter((f) => f.sev === s).length })) },
              ]} />
          } />
      </section>
    </OpsPage>
  );
}
