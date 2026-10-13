import { Typography, Space } from 'antd';
import { CheckCircleOutlined, ApiOutlined, RocketOutlined } from '../../../shared/icons';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip } from '../../../shared/components/ux';

const { Text } = Typography;

const CATEGORIES: { name: string; n: number; sample: string }[] = [
  { name: 'Observability', n: 111, sample: 'Datadog · Prometheus · Dynatrace · Auvik · SolarWinds' },
  { name: 'DevOps', n: 112, sample: 'Ansible · Argo CD · Argo Workflows' },
  { name: 'Cloud', n: 82, sample: 'AWS · Azure · GCP services' },
  { name: 'ITSM', n: 25, sample: 'ServiceNow CMDB · BMC Helix · Zendesk' },
  { name: 'AI', n: 98, sample: 'Bedrock · Azure AI · model APIs' },
  { name: 'Database', n: 47, sample: 'Redshift · CosmosDB · DynamoDB' },
  { name: 'Productivity', n: 114, sample: 'docs · sheets · workspace' },
  { name: 'Communication', n: 69, sample: 'Slack · Teams · email' },
  { name: 'CRM', n: 90, sample: 'Salesforce · HubSpot' },
  { name: 'Messaging', n: 25, sample: 'SNS · SQS · Kinesis' },
  { name: 'Identity', n: 18, sample: 'SSO · IdP' },
  { name: 'Security', n: 10, sample: 'GuardDuty · Defender' },
];

const OT_CONNECTORS: { name: string; p0?: boolean }[] = [
  { name: 'NVIDIA DCGM (GPU telemetry)', p0: true },
  { name: 'Liquid-Cooling CDU', p0: true },
  { name: 'BMS (BACnet)', p0: true },
  { name: 'Schneider EcoStruxure / APC', p0: true },
  { name: 'Dell iDRAC (Redfish)', p0: true },
  { name: 'Modbus (power meters/PDU)', p0: true },
  { name: 'SNMP (generic)', p0: true },
  { name: 'Vertiv (Liebert / Geist)' }, { name: 'Eaton IPM' }, { name: 'Liebert CRAC/CRAH' },
  { name: 'Cisco NX-OS / IOS-XE' }, { name: 'Arista CloudVision' }, { name: 'Juniper Junos' },
  { name: 'HPE iLO' }, { name: 'IPMI' }, { name: 'NETCONF / gNMI' }, { name: 'Infoblox DDI' }, { name: 'Nutanix Prism' },
];

export default function IntegrationsPage() {
  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3} style={{ marginBottom: "var(--vw-space-md)" }}>Integrations</div>
      <Text type="secondary">~1,119 connectors reused as-is from the existing framework (logical/IT layer) + facility/OT connectors built in the same framework.</Text>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Reusable Connectors" value={1119} icon={<CheckCircleOutlined />} iconTone="success" />
        <KPICard title="Facility / OT to Build" value={43} icon={<ApiOutlined />} iconTone="info" />
        <KPICard title="P0 (demo the spear)" value={10} color="#7c3aed" icon={<RocketOutlined />} iconTone="purple" />
      </div>
      <VwCard variant="parent" title="Reused connector categories (logical / IT layer)" style={{ marginBottom: "var(--vw-space-lg)" }}>
        <div className="vw-grid vw-grid-cols-auto-320 vw-gap-md">
          {CATEGORIES.map((c) => (
            <VwCard size="small" variant="child" bodyStyle={{ padding: "var(--vw-space-md)" }} key={c.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text strong>{c.name}</Text><VwChip color="green">{c.n}</VwChip></div>
              <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{c.sample}</Text>
            </VwCard>
          ))}
        </div>
      </VwCard>
      <VwCard size="small" title="Facility / OT layer — built in framework (the AI-density gap)">
        <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>The 1k library covers IT; these physical/OT connectors power the AI-density spear (power, thermal, GPU) and are built in the same connector framework. P0 = needed to demo on live data.</Text>
        <Space size={[8, 8]} wrap>
          {OT_CONNECTORS.map((o) => <VwChip key={o.name} color={o.p0 ? 'purple' : 'default'}>{o.p0 ? '★ ' : ''}{o.name}</VwChip>)}
        </Space>
      </VwCard>
    </div>
  );
}
