import { useMemo } from 'react';
import { Flame, PlugZap, Thermometer, Zap } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Fresh } from '../../../ops/ui/status';
import { StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { TimeChart } from '../../../ops/charts/TimeChart';
import { HeatGrid } from '../../../ops/charts/HeatGrid';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { DataContract } from '../components/PreviewScaffold';
import { synthSeries, pseudo } from '../components/previewViz';
import type { Rack, PDU } from '../../../mock/data/types';

const TEMP_BANDS = [
  { min: 32, label: '≥ 32°C', bg: 'var(--vw-color-red-200)', fg: 'var(--vw-color-red-800)' },
  { min: 28, label: '28–32°C', bg: 'var(--vw-color-amber-200)', fg: 'var(--vw-color-amber-800)' },
  { min: 25, label: '25–28°C', bg: 'var(--vw-color-yellow-100, #fef9c3)', fg: 'var(--vw-color-yellow-800, #854d0e)' },
  { min: -Infinity, label: '< 25°C', bg: 'var(--vw-color-emerald-100)', fg: 'var(--vw-color-emerald-800)' },
];
const tempBand = (t: number) => TEMP_BANDS.find((b) => t >= b.min)!;

export default function TelemetryPreview() {
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const pdus = (useEntityList('pdus', { pageSize: 500 }).data?.data ?? []) as unknown as PDU[];

  const k = useMemo(() => {
    const itLoadKw = Math.round(racks.reduce((s, r) => s + (r.currentPowerKw || 0), 0));
    const temps = racks.slice(0, 14).map((r, i) => ({
      name: r.name,
      temp: Math.round((20 + (r.powerUtilizationPct || 0) * 0.14 + pseudo(i, 5) * 4) * 10) / 10,
    }));
    const hottest = temps.reduce((m, t) => (t.temp > m.temp ? t : m), temps[0] ?? { name: '—', temp: 0 });
    const avgTemp = temps.length ? Math.round((temps.reduce((s, t) => s + t.temp, 0) / temps.length) * 10) / 10 : 0;
    return { itLoadKw, temps, hottest, avgTemp, peakKw: Math.round(itLoadKw * 1.12) };
  }, [racks]);

  const powerStream = synthSeries(60, k.itLoadKw || 500, (k.itLoadKw || 500) * 0.06);
  const tempStream = synthSeries(60, k.avgTemp || 24, 1.4);
  const sampleLabels = powerStream.map((_, i) => `#${i + 1}`);
  const tempSub = (t: number): 'bad' | 'warn' | undefined => (t >= 32 ? 'bad' : t >= 28 ? 'warn' : undefined);

  const pduRows = pdus.slice(0, 12);
  const pduCols: Col<PDU>[] = [
    { key: 'name', header: 'PDU', sort: (r) => r.name, render: (r) => <span className="strong mono">{r.name}</span> },
    { key: 'load', header: 'Load (kW)', align: 'right', sort: (r) => r.loadKw, render: (r) => <span className="num">{r.loadKw}</span> },
    { key: 'cap', header: 'Capacity (kW)', align: 'right', sort: (r) => r.capacityKw, render: (r) => <span className="num">{r.capacityKw}</span> },
    { key: 'pct', header: 'Load %', sort: (r) => r.loadPct, render: (r) => <Chip tone={r.loadPct >= 85 ? 'error' : r.loadPct >= 60 ? 'orange' : 'success'} dot>{r.loadPct}%</Chip> },
    { key: 'outlets', header: 'Outlets used', align: 'right', render: (r) => <span className="num">{r.outletsUsed}/{r.outletCount}</span> },
  ];

  return (
    <OpsPage title="Live Power & Thermal Telemetry" description="Real-time monitoring of power draw and rack inlet temperatures, streamed from OT/PDU/sensor feeds."
      actions={<Fresh>Live stream (simulated) · updating every few seconds when wired</Fresh>}>
      <StatGrid cols={4}>
        <StatTile label="Live IT load" value={<>{k.itLoadKw.toLocaleString()}<small> kW</small></>} sub="sum of rack draw" />
        <StatTile label="Peak today" value={<>{k.peakKw.toLocaleString()}<small> kW</small></>} sub="highest sample" />
        <StatTile label="Avg inlet temp" value={<>{k.avgTemp}<small> °C</small></>} sub="across sampled racks" subTone={tempSub(k.avgTemp)} />
        <StatTile label="Hottest rack" value={`${k.hottest.temp}°C`} sub={k.hottest.name} subTone={tempSub(k.hottest.temp)} />
      </StatGrid>

      <div className="grid g-2">
        <Panel title="Power draw — live stream (kW)" icon={Zap}>
          <TimeChart height={200} legend={false} labels={sampleLabels} format={(v) => `${Math.round(v).toLocaleString()} kW`}
            series={[{ key: 'kw', label: 'Power draw', color: '#2563eb', kind: 'area', values: powerStream }]} />
        </Panel>
        <Panel title="Inlet temperature — live stream (°C)" icon={Thermometer}>
          <TimeChart height={200} legend={false} labels={sampleLabels} yMin={Math.floor(Math.min(...tempStream) - 2)} format={(v) => `${v.toFixed(1)}°C`}
            series={[{ key: 'temp', label: 'Inlet temperature', color: '#dc2626', kind: 'area', values: tempStream }]} />
        </Panel>
      </div>

      <Panel title="Rack inlet hotspot map" sub="Inlet temperature per rack" icon={Flame} count={k.temps.length}>
        <HeatGrid
          rows={[{ key: 'inlet', label: 'Inlet °C', cells: k.temps.map((t) => t.temp) }]}
          columns={k.temps.map((t) => t.name.replace('R-', ''))}
          fullColumns={k.temps.map((t) => t.name)}
          tone={(v) => { const b = tempBand(v); return { bg: b.bg, fg: b.fg }; }}
          format={(v) => `${v}°`}
          legend={TEMP_BANDS.map((b) => ({ label: b.label, bg: b.bg }))} />
      </Panel>

      <Panel title="PDU live load" icon={PlugZap} count={pduRows.length} flush>
        <DataTable rows={pduRows} cols={pduCols} pageSize={50} compact />
      </Panel>

      <DataContract
        sources={['PDU/rPDU metering', 'UPS controllers', 'Rack inlet temp sensors', 'BMS (Modbus/BACnet)']}
        cadence="Streaming, 1–60 s per point"
        fields={[
          { name: 'pdu.loadKw / outlet.amps', desc: 'live per-PDU and per-outlet power' },
          { name: 'rack.inletTempC', desc: 'front-door inlet temperature per rack' },
          { name: 'ups.loadPct / runtimeMin', desc: 'live UPS load + remaining runtime' },
          { name: 'sampledAt', desc: 'sensor timestamp for stream alignment' },
        ]}
        notes={[
          'Needs a streaming pipeline (e.g. SNMP traps / Redfish / MQTT → time-series DB) and websockets to the UI.',
          'UI renders live tiles, rolling charts, and a hotspot map; thresholds/alerts come from the same stream.',
        ]}
      />
    </OpsPage>
  );
}
