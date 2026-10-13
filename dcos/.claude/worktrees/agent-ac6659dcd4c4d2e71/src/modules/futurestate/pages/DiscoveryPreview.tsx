import { useMemo } from 'react';
import { Row, Col, Timeline, Typography } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { DesktopOutlined, WarningOutlined, SyncOutlined, CheckCircleOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { PreviewPage } from '../components/PreviewScaffold';
import { pseudo } from '../components/previewViz';
import type { ManagedDevice, DiscoveryJob } from '../../../mock/data/types';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;

export default function DiscoveryPreview() {
  const devices = (useEntityList('managedDevices', { pageSize: 400 }).data?.data ?? []) as unknown as ManagedDevice[];
  const jobs = (useEntityList('discoveryJobs', { pageSize: 50 }).data?.data ?? []) as unknown as DiscoveryJob[];

  const recon = useMemo(() => {
    return devices.slice(0, 40).map((d, i) => {
      const roll = pseudo(i, 11);
      const status = roll > 0.82 ? 'New / unplanned' : roll > 0.66 ? 'Drift' : 'Matched';
      return {
        id: d.id,
        hostname: d.hostname ?? d.id,
        ip: d.mgmtIp ?? '—',
        type: d.deviceType ?? 'Device',
        source: d.sourceSystem ?? 'scanner',
        status,
      };
    });
  }, [devices]);

  const found = recon.length;
  const unplanned = recon.filter((r) => r.status === 'New / unplanned').length;
  const drift = recon.filter((r) => r.status === 'Drift').length;
  const reconciledPct = found ? Math.round(((found - unplanned - drift) / found) * 100) : 0;

  return (
    <PreviewPage
      title="Network Discovery & Ingestion"
      subtitle="Automated discovery runs, discovered-vs-planned reconciliation against the source of truth, and an ingestion log."
      contract={{
        sources: ['SNMP / LLDP', 'Redfish (BMC)', 'DHCP leases', 'ARP scan', 'vendor controllers (UniFi, etc.)'],
        cadence: 'Scheduled (e.g. hourly/nightly) + on-demand',
        fields: [
          { name: 'discoveredDevice{}', desc: 'hostname, mgmtIp, mac, serial, vendor, model, neighbors' },
          { name: 'matchKey (mac/serial)', desc: 'stable key to reconcile against the SoT record' },
          { name: 'runMeta', desc: 'job id, scope, method, started/completed, counts' },
          { name: 'dedupRules', desc: 'collapse duplicate sightings across scanners' },
        ],
        notes: [
          'Reconciliation engine compares discovered vs planned and classifies Matched / New / Drift; UI renders the diff + an accept/ignore action.',
          'Ingestion must be idempotent and dedup by MAC/serial so repeat runs don’t create duplicates.',
        ],
      }}
    >
      <div className="vw-grid vw-grid-cols-4 vw-gap-md">
        <KPICard title="Devices discovered" value={found} icon={<DesktopOutlined />} iconTone="info" />
        <KPICard title="New / unplanned" value={unplanned} color="#f59e0b" icon={<WarningOutlined />} iconTone="warning" />
        <KPICard title="Config / SoT drift" value={drift} color="var(--vw-color-red-600)" icon={<SyncOutlined />} iconTone="error" />
        <KPICard title="Reconciled" value={reconciledPct} suffix="%" color="var(--vw-color-green-600)" icon={<CheckCircleOutlined />} iconTone="success" />
      </div>

      <Row gutter={[16, 16]} style={{ marginTop: "var(--vw-space-lg)" }}>
        <Col xs={24} lg={16}>
          <div className="vw-card-title" style={{ marginBottom: "var(--vw-space-xxs)" }}>Discovered vs planned — reconciliation</div>
          <div style={{ fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-gray-500)', marginBottom: "var(--vw-space-sm)" }}>
            Showing {recon.length} devices
          </div>
          <VwCard bodyStyle={{ padding: 0 }} style={{ height: 'calc(100% - 44px)' }}>
            <Table
              size="small"
              rowKey="id"
              pagination={false} sticky={TABLE_STICKY}
              scroll={{ x: 'max-content', y: 320 }}
              dataSource={recon}
              columns={[
                { title: 'Hostname', dataIndex: 'hostname' },
                { title: 'Mgmt IP', dataIndex: 'ip' },
                { title: 'Type', dataIndex: 'type', render: (t: string) => <VwChip>{t}</VwChip> },
                { title: 'Source', dataIndex: 'source' },
                {
                  title: 'Reconciliation', dataIndex: 'status',
                  render: (s: string) => <VwChip color={s === 'Matched' ? 'green' : s === 'Drift' ? 'red' : 'orange'}>{s}</VwChip>,
                },
              ]}
            />
          </VwCard>
        </Col>
        <Col xs={24} lg={8}>
          <VwCard size="small" title="Ingestion log" style={{ height: '100%' }}>
            <Timeline
              items={(jobs.length ? jobs.slice(0, 6) : []).map((j) => ({
                color: j.status === 'Completed' ? 'green' : j.status === 'Failed' ? 'red' : 'blue',
                children: (
                  <div>
                    <Text strong>{j.name}</Text>
                    <div style={{ fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)" }}>{j.method} · {j.scope}</div>
                    <div style={{ fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)" }}>{j.devicesFound} devices · {j.linksFound} links · {j.status}</div>
                  </div>
                ),
              }))}
            />
            {jobs.length === 0 && <Text type="secondary">No runs yet.</Text>}
          </VwCard>
        </Col>
      </Row>
    </PreviewPage>
  );
}
