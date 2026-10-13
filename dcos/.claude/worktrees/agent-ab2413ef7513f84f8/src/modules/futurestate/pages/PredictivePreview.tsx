import { useMemo } from 'react';
import { Row, Col, Progress, Typography, List } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { WarningOutlined, AlertOutlined, ExperimentOutlined, CheckCircleOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { PreviewPage } from '../components/PreviewScaffold';
import { pseudo } from '../components/previewViz';
import type { ManagedDevice, UPS, CRAC } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;

interface RiskRow {
  id: string; name: string; type: string; risk: number; window: number; action: string;
}

export default function PredictivePreview() {
  const devices = (useEntityList('managedDevices', { pageSize: 400 }).data?.data ?? []) as unknown as ManagedDevice[];
  const ups = (useEntityList('upsUnits', { pageSize: 200 }).data?.data ?? []) as unknown as UPS[];
  const cracs = (useEntityList('cracUnits', { pageSize: 200 }).data?.data ?? []) as unknown as CRAC[];

  const rows = useMemo<RiskRow[]>(() => {
    const ACTIONS = ['Schedule PSU replacement', 'Inspect cooling fan', 'Battery health check', 'Firmware update + reseat', 'Replace before EOL window'];
    const pool: { id: string; name: string; type: string }[] = [
      ...devices.slice(0, 40).map((d) => ({ id: d.id, name: d.hostname ?? d.id, type: d.deviceType ?? 'Device' })),
      ...ups.map((u) => ({ id: u.id, name: u.name, type: 'UPS' })),
      ...cracs.map((c) => ({ id: c.id, name: c.name, type: 'Cooling' })),
    ];
    return pool
      .map((p, i) => {
        const risk = Math.round(20 + pseudo(i, 3) * 79);
        return { ...p, risk, window: 3 + Math.round(pseudo(i, 7) * 45), action: ACTIONS[i % ACTIONS.length] };
      })
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 12);
  }, [devices, ups, cracs]);

  const atRisk = rows.filter((r) => r.risk >= 70).length;
  const failures30 = rows.filter((r) => r.risk >= 70 && r.window <= 30).length;

  const anomalies = [
    { c: rows[0]?.name ?? 'ups-1', metric: 'Battery runtime', obs: '6.2 min', base: '14 min', sev: 'Major' },
    { c: rows[1]?.name ?? 'crac-12', metric: 'Return-air temp', obs: '34°C', base: '27°C', sev: 'Major' },
    { c: rows[2]?.name ?? 'tor-a3x', metric: 'CRC error rate', obs: '4.1%', base: '0.2%', sev: 'Minor' },
    { c: rows[3]?.name ?? 'pdu-7', metric: 'Phase imbalance', obs: '18%', base: '<5%', sev: 'Minor' },
  ];

  const riskColor = (r: number) => (r >= 85 ? 'var(--vw-color-red-600)' : r >= 70 ? '#f59e0b' : 'var(--vw-color-green-600)');

  return (
    <PreviewPage
      title="Predictive Failure & Anomaly Detection"
      subtitle="Model-driven risk scoring, predicted failure windows, and anomaly flags for power, cooling, and network assets."
      contract={{
        sources: ['Time-series telemetry store', 'Asset registry + lifecycle', 'Maintenance/incident history'],
        cadence: 'Scoring hourly; anomaly stream near-real-time',
        fields: [
          { name: 'metricHistory[]', desc: '≥90 days of per-asset telemetry (temp, load, errors, runtime)' },
          { name: 'assetAge / eolDate', desc: 'lifecycle features for the risk model' },
          { name: 'failureLabels[]', desc: 'historical failures/RMAs to train + validate the model' },
          { name: 'baselineProfile', desc: 'learned normal range per metric for anomaly deviation' },
        ],
        notes: [
          'Risk score + predicted window must be produced by a server-side model; UI only renders score, window, confidence, and the contributing features.',
          'Every flag should link to the evidence (which metric, how far from baseline) so an engineer can trust it.',
        ],
      }}
    >
      <div className="vw-grid vw-grid-cols-4 vw-gap-md">
        <KPICard title="Components at risk" value={atRisk} color="#f59e0b" icon={<WarningOutlined />} iconTone="warning" />
        <KPICard title="Predicted failures (30d)" value={failures30} color="var(--vw-color-red-600)" icon={<AlertOutlined />} iconTone="error" />
        <KPICard title="Open anomalies" value={anomalies.length} icon={<ExperimentOutlined />} iconTone="purple" />
        <KPICard title="Model confidence" value={87} suffix="%" color="var(--vw-color-green-600)" icon={<CheckCircleOutlined />} iconTone="success" />
      </div>

      <Row gutter={[16, 16]} style={{ marginTop: "var(--vw-space-lg)" }}>
        <Col xs={24} lg={15}>
          <VwCard size="small" title="Top at-risk components" style={{ height: '100%' }}>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              sticky={TABLE_STICKY}
              scroll={{ y: 320, x: 'max-content' }}
              dataSource={rows}
              columns={[
                { title: 'Component', dataIndex: 'name' },
                { title: 'Type', dataIndex: 'type', render: (t: string) => <VwChip>{t}</VwChip> },
                {
                  title: 'Risk', dataIndex: 'risk', width: 140,
                  render: (r: number) => <Progress percent={r} size="small" strokeColor={riskColor(r)} format={(p) => `${p}`} />,
                },
                { title: 'Predicted window', dataIndex: 'window', render: (w: number) => `~${w} days` },
                { title: 'Recommended action', dataIndex: 'action' },
              ]}
            />
          </VwCard>
        </Col>
        <Col xs={24} lg={9}>
          <VwCard size="small" title="Anomaly feed" style={{ height: '100%' }}>
            <List
              size="small"
              dataSource={anomalies}
              renderItem={(a) => (
                <List.Item>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text strong>{a.c}</Text>
                      <VwChip color={a.sev === 'Major' ? 'red' : 'orange'}>{a.sev}</VwChip>
                    </div>
                    <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{a.metric}: <b style={{ color: 'var(--vw-color-red-600)' }}>{a.obs}</b> vs baseline {a.base}</Text>
                  </div>
                </List.Item>
              )}
            />
          </VwCard>
        </Col>
      </Row>
    </PreviewPage>
  );
}
