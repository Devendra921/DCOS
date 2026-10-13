import { useMemo } from 'react';
import { Row, Col, Typography, Space } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { ThunderboltOutlined, RiseOutlined, DashboardOutlined, FireOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { PulseDot, VwCard, VwChip } from '../../../shared/components/ux';
import { PreviewPage } from '../components/PreviewScaffold';
import { MiniArea, synthSeries, pseudo } from '../components/previewViz';
import type { Rack, PDU } from '../../../mock/data/types';

const { Text } = Typography;

function tempColor(t: number) {
  return t >= 32 ? 'var(--vw-color-red-600)' : t >= 28 ? '#f59e0b' : t >= 25 ? '#eab308' : 'var(--vw-color-green-600)';
}

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

  return (
    <PreviewPage
      title="Live Power & Thermal Telemetry"
      subtitle="Real-time monitoring of power draw and rack inlet temperatures, streamed from OT/PDU/sensor feeds."
      contract={{
        sources: ['PDU/rPDU metering', 'UPS controllers', 'Rack inlet temp sensors', 'BMS (Modbus/BACnet)'],
        cadence: 'Streaming, 1–60 s per point',
        fields: [
          { name: 'pdu.loadKw / outlet.amps', desc: 'live per-PDU and per-outlet power' },
          { name: 'rack.inletTempC', desc: 'front-door inlet temperature per rack' },
          { name: 'ups.loadPct / runtimeMin', desc: 'live UPS load + remaining runtime' },
          { name: 'sampledAt', desc: 'sensor timestamp for stream alignment' },
        ],
        notes: [
          'Needs a streaming pipeline (e.g. SNMP traps / Redfish / MQTT → time-series DB) and websockets to the UI.',
          'UI renders live tiles, rolling charts, and a hotspot map; thresholds/alerts come from the same stream.',
        ],
      }}
    >
      <Space style={{ marginBottom: "var(--vw-space-md)" }}><PulseDot status="ok" /><Text type="secondary">Live stream (simulated) · updating every few seconds when wired</Text></Space>
      <div className="vw-grid vw-grid-cols-4 vw-gap-md">
        <KPICard title="Live IT Load" value={k.itLoadKw.toLocaleString()} suffix=" kW" icon={<ThunderboltOutlined />} iconTone="info" />
        <KPICard title="Peak today" value={k.peakKw.toLocaleString()} suffix=" kW" icon={<RiseOutlined />} iconTone="purple" />
        <KPICard title="Avg inlet temp" value={k.avgTemp} suffix=" °C" color={tempColor(k.avgTemp)} icon={<DashboardOutlined />} iconTone="cyan" />
        <KPICard title="Hottest rack" value={`${k.hottest.temp}°C`} color={tempColor(k.hottest.temp)} icon={<FireOutlined />} iconTone="error" />
      </div>

      <Row gutter={[16, 16]} style={{ marginTop: "var(--vw-space-lg)" }}>
        <Col xs={24} md={12}>
          <VwCard size="small" title="Power draw — live stream (kW)">
            <MiniArea data={powerStream} color="#2563eb" fill="rgba(37,99,235,0.12)" />
          </VwCard>
        </Col>
        <Col xs={24} md={12}>
          <VwCard size="small" title="Inlet temperature — live stream (°C)">
            <MiniArea data={tempStream} color="var(--vw-color-red-600)" fill="rgba(220,38,38,0.10)" />
          </VwCard>
        </Col>
      </Row>

      <VwCard size="small" title="Rack inlet hotspot map" style={{ marginTop: "var(--vw-space-lg)" }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {k.temps.map((t) => (
            <div key={t.name} title={`${t.name}: ${t.temp}°C`}
              style={{ width: 64, height: 46, borderRadius: 6, background: tempColor(t.temp), color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: "var(--vw-font-label-xs)" }}>
              <span style={{ opacity: 0.9 }}>{t.name.replace('R-', '')}</span>
              <strong style={{ fontSize: "var(--vw-font-label-sm)" }}>{t.temp}°</strong>
            </div>
          ))}
        </div>
      </VwCard>

      <VwCard size="small" title="PDU live load" style={{ marginTop: "var(--vw-space-lg)" }}>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={pdus.slice(0, 12)}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'PDU', dataIndex: 'name' },
            { title: 'Load (kW)', dataIndex: 'loadKw' },
            { title: 'Capacity (kW)', dataIndex: 'capacityKw' },
            {
              title: 'Load %', dataIndex: 'loadPct',
              render: (p: number) => <VwChip color={p >= 85 ? 'red' : p >= 60 ? 'orange' : 'green'}>{p}%</VwChip>,
            },
            { title: 'Outlets used', render: (_: unknown, r: PDU) => `${r.outletsUsed}/${r.outletCount}` },
          ]}
        />
      </VwCard>
    </PreviewPage>
  );
}
