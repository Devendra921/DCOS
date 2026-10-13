import { PageEmptyState } from '../../../shared/components/ux/PageEmptyState';
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { App, Descriptions, Space, Typography, Drawer } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { CalendarRange, Pencil, Server, Archive } from 'lucide-react';
import { ApiOutlined } from '../../../shared/icons';
import { VwChip } from '../../../shared/components/ux';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, KV, Panel, Tabs } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Meter } from '../../../ops/ui/status';
import { SoftMeter, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityDetail, useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import RackElevation from '../components/RackElevation';
import RackFormModal from '../components/RackFormModal';
import { DeviceFaceplate } from '../../dcim/components/DeviceFaceplate';
import { ChangeRefModal } from '../../change';
import { EntityAuditTab, EntityDocumentsTab } from '../../../shared/components/detail';
import type { Rack, Device, RackReservation, DeviceComponent, Cable, Cdu, UtilityFeed, PowerFeed, Customer } from '../../../mock/data/types';
import { DENSITY_LABEL, fmtKw, rackDensity } from '../lib/estateView';
import type { ApprovedCR } from '../../change';

export default function RackDetailPage() {
  const { rackId } = useParams();
  const navigate = useNavigate();
  const { data: rack } = useEntityDetail('racks', rackId);
  const { data: assetRes } = useEntityList('devices', { filters: [{ field: 'rackId', operator: 'eq', value: rackId }], pageSize: 500 });
  const r = rack as unknown as Rack | null;
  const devices = (assetRes?.data ?? []) as unknown as Device[];
  const { data: rsvnRes } = useEntityList('rackReservations', { filters: [{ field: 'rackId', operator: 'eq', value: rackId }], pageSize: 200 });
  const reservations = (rsvnRes?.data ?? []) as unknown as RackReservation[];
  // For the device peek drawer: components + cables + a name map across all devices.
  const allDevices = (useEntityList('devices', { pageSize: 20000 }).data?.data ?? []) as unknown as Device[];
  const components = (useEntityList('deviceComponents', { pageSize: 500000 }).data?.data ?? []) as unknown as DeviceComponent[];
  const cables = (useEntityList('cables', { pageSize: 100000 }).data?.data ?? []) as unknown as Cable[];
  // Estate links: the CDU that cools the rack, its A/B feeds and the tenant leasing it.
  const dcScope = r?.dataCenterId ? [{ field: 'dataCenterId', operator: 'eq' as const, value: r.dataCenterId }] : [];
  const cdus = (useEntityList(r?.dataCenterId ? 'cdus' : '__noop__', { pageSize: 500, filters: dcScope }).data?.data ?? []) as unknown as Cdu[];
  const utilityFeeds = (useEntityList(r?.dataCenterId ? 'utilityFeeds' : '__noop__', { pageSize: 200, filters: dcScope }).data?.data ?? []) as unknown as UtilityFeed[];
  const powerFeeds = (useEntityList('powerFeeds', { pageSize: 10000 }).data?.data ?? []) as unknown as PowerFeed[];
  const customers = (useEntityList('customers', { pageSize: 2000 }).data?.data ?? []) as unknown as Customer[];
  const [peekId, setPeekId] = useState<string | null>(null);
  const [tab, setTab] = useState<'assets' | 'power' | 'reservations' | 'activity' | 'docs'>('assets');
  // RackElevation + table read `startU`/`heightU`; Device stores rack position in `position`.
  const assets = devices.map((d) => ({ ...d, startU: d.position, heightU: d.heightU ?? 1 }));
  const { message } = App.useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [gate, setGate] = useState<{ title: string; run: (cr: ApprovedCR) => void } | null>(null);
  const updateRack = useEntityUpdate('racks');
  const updateDevice = useEntityUpdate('devices');
  const audit = useRecordAudit();
  const overlaps = (s1: number, e1: number, s2: number, e2: number) => s1 <= e2 && s2 <= e1;
  const onMoveAsset = (assetId: string, newStartU: number) => {
    const a = assets.find((x) => x.id === assetId);
    if (!a || !r) return;
    const h = a.heightU ?? 1;
    const end = newStartU + h - 1;
    if (newStartU < 1 || end > r.heightU) { message.error('Move is outside the rack bounds'); return; }
    const clash = assets.some((o) => o.id !== assetId && o.startU != null && overlaps(newStartU, end, o.startU, o.startU + (o.heightU ?? 1) - 1));
    if (clash) { message.error('Those U-slots are occupied'); return; }
    if (newStartU === a.startU) return;
    const label = a.hostname ?? a.model ?? a.name;
    setGate({ title: `Relocate ${label} → U${newStartU}`, run: (cr) => updateDevice.mutate({ id: assetId, data: { position: newStartU } }, { onSuccess: () => { message.success(`Moved ${label} to U${newStartU}`); audit('Device', assetId, 'relocated', `Moved ${label} to U${newStartU} [CR ${cr.ref}]`); } }) });
  };

  if (!r) return <PageEmptyState title="Rack not found" />;

  const density = rackDensity(r);
  const cdu = r.cduId ? cdus.find((c) => c.id === r.cduId) : undefined;
  const tenant = r.tenantCustomerId ? customers.find((c) => c.id === r.tenantCustomerId) : undefined;
  const feedCell = (id?: string) => {
    if (!id) return <span className="vw-label">Not recorded</span>;
    const u = utilityFeeds.find((f) => f.id === id);
    if (u) return <span><Link to={`/facility/dc/${r.dataCenterId}?tab=power`}>{u.name}</Link> <span className="vw-label">· utility · {u.supply ?? 'AC'} · {u.ratingText ?? `${u.voltage} V`}{u.normalRole ? ` · ${u.normalRole.toLowerCase()}` : ''}</span></span>;
    const p = powerFeeds.find((f) => f.id === id);
    if (p) return <span><Link to="/facility/power-dist">{p.name}</Link> <span className="vw-label">· {p.supply} · {p.voltage} V · {p.amperage} A · {p.status}</span></span>;
    return <span>{id} <span className="vw-label">· not found</span></span>;
  };
  const contractPct = r.contractedKw ? Math.round((r.currentPowerKw / r.contractedKw) * 100) : 0;

  const peek = peekId ? allDevices.find((d) => d.id === peekId) : null;
  const peekComps = peek ? components.filter((c) => c.deviceId === peek.id) : [];
  const cableOf = (cid: string) => cables.find((c) => c.aComponentId === cid || c.bComponentId === cid);
  const peerLabel = (cid: string) => {
    const cb = cableOf(cid); if (!cb) return undefined;
    const pid = cb.aComponentId === cid ? cb.bComponentId : cb.aComponentId;
    const p = components.find((c) => c.id === pid);
    return p ? `${allDevices.find((d) => d.id === p.deviceId)?.name ?? '?'} : ${p.name}` : undefined;
  };

  type AssetRow = (typeof assets)[number];
  const assetCols: Col<AssetRow>[] = [
    { key: 'u', header: 'U', sort: (a) => a.startU ?? 0, render: (a) => <span className="num">{a.startU ?? '—'}</span> },
    { key: 'host', header: 'Hostname', sort: (a) => a.hostname ?? '', render: (a) => (
      <span className="cell-2"><span className="vw-card-activity-label">{a.hostname ?? a.name}</span><small>{a.model ?? '—'}</small></span>
    ) },
    { key: 'category', header: 'Category', sort: (a) => a.category ?? '', render: (a) => a.category ? <Chip tone="neutral">{a.category}</Chip> : <span className="vw-label">—</span> },
    { key: 'power', header: 'Power (W)', align: 'right', sort: (a) => a.powerDrawW ?? 0, render: (a) => <span className="num">{a.powerDrawW ?? '—'}</span> },
    { key: 'lifecycle', header: 'Lifecycle', sort: (a) => a.lifecycleState ?? '', render: (a) => a.lifecycleState ?? '—' },
  ];
  const rsvnCols: Col<RackReservation>[] = [
    { key: 'units', header: 'Units', render: (x) => x.units && x.units.length ? <span className="num">U{Math.min(...x.units)}–U{Math.max(...x.units)} ({x.units.length}U)</span> : '—' },
    { key: 'by', header: 'Reserved by', sort: (x) => x.reservedBy, render: (x) => (
      <span className="cell-2"><span className="vw-card-activity-label">{x.reservedBy}</span><small>{x.tenant ?? '—'}</small></span>
    ) },
    { key: 'desc', header: 'Description', wrap: true, render: (x) => x.description ?? '—' },
    { key: 'status', header: 'Status', sort: (x) => x.status, render: (x) => <Chip tone={x.status === 'Active' ? 'warning' : 'neutral'} dot>{x.status}</Chip> },
  ];
  const uPct = pct(r.usedU, r.heightU);
  const wPct = Math.round((r.currentWeightKg / r.maxWeightKg) * 100);
  const loadTone = (p: number): Tone => (p >= 85 ? 'error' : p >= 70 ? 'warning' : 'info');

  return (
    <OpsPage title={r.name}
      actions={<>
        <Chip tone={r.purpose === 'GPU' ? 'purple' : 'info'}>{r.purpose}</Chip>
        <Chip tone="neutral" dot>{r.status}</Chip>
        {density === 'ai' && <Chip tone="purple">AI density</Chip>}
        {r.liquidCooled ? <Chip tone="cyan">Liquid-cooled</Chip> : r.liquidCoolingReady && <Chip tone="cyan">Liquid-cooling ready</Chip>}
        {r.ownerKind === 'tenant' && <Chip tone="info">Tenant: {tenant?.name ?? r.tenantCustomerId ?? 'unknown'}</Chip>}
        <Btn icon={Pencil} onClick={() => setEditOpen(true)}>Edit</Btn>
        {r.status !== 'Retired' && <Btn variant="danger" icon={Archive} onClick={() => setGate({ title: `Retire rack ${r.name}`, run: (cr) => updateRack.mutate({ id: r.id, data: { status: 'Retired' } }, { onSuccess: () => { message.success('Rack retired'); audit('Rack', r.rackId, 'retired', `Retired ${r.name} [CR ${cr.ref}]`); } }) })}>Retire</Btn>}
      </>}>
      <RackFormModal open={editOpen} onClose={() => setEditOpen(false)} rack={r} />

      <StatGrid cols={4}>
        <StatTile label="U utilization" value={<>{uPct}<small>%</small></>} sub={`${r.usedU}/${r.heightU}U`}>
          <SoftMeter pct={uPct} tone={loadTone(uPct)} />
        </StatTile>
        <StatTile label="Power" value={<>{r.powerUtilizationPct}<small>%</small></>} sub={`${r.currentPowerKw}/${r.maxPowerKw} kW`} subTone={r.powerUtilizationPct >= 85 ? 'bad' : undefined}>
          <SoftMeter pct={r.powerUtilizationPct} tone={loadTone(r.powerUtilizationPct)} />
        </StatTile>
        <StatTile label="Weight" value={<>{wPct}<small>%</small></>} sub={`${r.currentWeightKg}/${r.maxWeightKg} kg`}>
          <SoftMeter pct={wPct} tone={loadTone(wPct)} />
        </StatTile>
        <StatTile label="Thermal" value={<>{r.thermalDensityKwPerRack}<small> kW</small></>} sub={`${r.redundancy} redundancy`} />
      </StatGrid>

      <div className="detail-rack-layout">
        <Panel title="Rack elevation" icon={Server} sub="drag to move · click to open">
          <RackElevation rack={r} assets={assets} onMoveAsset={onMoveAsset} onOpenDevice={setPeekId} />
        </Panel>
        <div className="col" style={{ gap: 16, minWidth: 0 }}>
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'assets', label: 'Assets', count: assets.length },
            { id: 'power', label: 'Power & Cooling' },
            { id: 'reservations', label: 'Reservations', count: reservations.length },
            { id: 'activity', label: 'Activity' },
            { id: 'docs', label: 'Documents' },
          ]} />
          {tab === 'assets' && (
            <section className="vw-card-section dcl-table">
              <DataTable rows={assets} cols={assetCols} defaultSort={{ key: 'u', dir: 'asc' }} pageSize={50} maxHeight={480} />
            </section>
          )}
          {tab === 'power' && (
            <Panel title="Power & Cooling">
              <KV cols={2} items={[
                ['Power budget', `${r.maxPowerKw} kW`],
                ['Current draw', `${r.currentPowerKw} kW`],
                ['Utilization', <Meter key="util" pct={r.powerUtilizationPct} width={120} />],
                ['Redundancy', r.redundancy],
                ['Thermal density', `${r.thermalDensityKwPerRack} kW`],
                ['Density', DENSITY_LABEL[density]],
                ['Liquid cooling', r.liquidCooled
                  ? <span key="lc">Liquid-cooled{cdu ? <> by {cdu.hallId ? <Link to={`/facility/hall/${cdu.hallId}`}>{cdu.name}</Link> : cdu.name} <span className="vw-label">· {fmtKw(cdu.capacityKw)} CDU · {cdu.nominalFlowLpm} L/min</span></> : <> <Chip tone="warning">no CDU recorded</Chip></>}</span>
                  : r.liquidCoolingReady ? 'Ready, not connected' : 'No (air cooled)'],
                ['Feed A', feedCell(r.feedAId)],
                ['Feed B', feedCell(r.feedBId)],
                ['Owner', r.ownerKind === 'tenant' ? 'Tenant' : r.ownerKind === 'operator' ? 'Operator' : r.owner],
                ...(r.ownerKind === 'tenant' ? [['Tenant', tenant ? <Link key="tn" to={`/customers/${tenant.id}`}>{tenant.name}</Link> : r.tenantCustomerId ?? '—'] as [string, React.ReactNode]] : []),
                ...(r.contractedKw != null ? [['Contracted power', <span key="cp">
                  {r.contractedKw} kW of the {r.maxPowerKw} kW budget · drawing {r.currentPowerKw} kW ({contractPct}% of contract)
                  {r.currentPowerKw > r.contractedKw && <> <Chip tone="error">over contract by {Math.round((r.currentPowerKw - r.contractedKw) * 10) / 10} kW</Chip></>}
                  {r.contractedKw > r.maxPowerKw && <> <Chip tone="warning">contract exceeds the rack budget</Chip></>}
                </span>] as [string, React.ReactNode]] : []),
                ['Rail width', r.widthIn ? `${r.widthIn}"` : '—'],
                ['Unit numbering', `${r.descendingUnits ? 'Descending' : 'Ascending'}${r.startingUnit ? ` · from U${r.startingUnit}` : ''}`],
                ['Outer (W×D)', r.outerWidthMm && r.outerDepthMm ? `${r.outerWidthMm}×${r.outerDepthMm} mm` : '—'],
                ['Mounting depth', r.mountingDepthMm ? `${r.mountingDepthMm} mm` : '—'],
              ]} />
            </Panel>
          )}
          {tab === 'reservations' && (
            <Panel title="Reservations" icon={CalendarRange} count={reservations.length} flush={reservations.length > 0}>
              {reservations.length === 0
                ? <Empty icon={CalendarRange} title="No U-space reservations on this rack" />
                : <DataTable rows={reservations} cols={rsvnCols} compact pageSize={50} />}
            </Panel>
          )}
          {tab === 'activity' && <Panel title="Activity"><EntityAuditTab entityType="Rack" entityId={r.rackId} /></Panel>}
          {tab === 'docs' && <Panel title="Documents"><EntityDocumentsTab entityId={r.id} /></Panel>}
        </div>
      </div>

      <Drawer mask={false}
        width={460}
        open={!!peek}
        onClose={() => setPeekId(null)}
        title={peek ? peek.name : ''}
        extra={peek && <Button type="primary" size="small" icon={<ApiOutlined />} onClick={() => navigate(`/facility/devices/${peek.id}`)}>Open full device page</Button>}
      >
        {peek && (
          <>
            <Space wrap style={{ marginBottom: "var(--vw-space-md)" }}>
              {peek.category && <VwChip>{peek.category}</VwChip>}
              {peek.model && <VwChip color="blue">{peek.model}</VwChip>}
              <VwChip>{peek.status}</VwChip>
              {peek.position != null && <VwChip>U{peek.position}</VwChip>}
            </Space>
            <Descriptions column={1} size="small" style={{ marginBottom: "var(--vw-space-md)" }}>
              <Descriptions.Item label="Serial">{peek.serial ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Primary IPv4">{peek.primaryIp4 ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Power draw">{peek.powerDrawW != null ? `${peek.powerDrawW} W` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Lifecycle">{peek.lifecycleState ?? '—'}</Descriptions.Item>
            </Descriptions>
            <Typography.Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>Faceplate</Typography.Text>
            <div style={{ marginTop: "var(--vw-space-sm)" }}>
              <DeviceFaceplate components={peekComps} isCabled={(id) => !!cableOf(id)} peerLabel={peerLabel} compact
                onPort={() => navigate(`/facility/devices/${peek.id}`)} />
            </div>
          </>
        )}
      </Drawer>

      <ChangeRefModal open={!!gate} title={gate?.title ?? ''} onCancel={() => setGate(null)} onConfirm={(cr) => { gate?.run(cr); setGate(null); }} />
    </OpsPage>
  );
}
function pct(used: number, total: number) { return total > 0 ? Math.round((used / total) * 100) : 0; }
