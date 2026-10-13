import { Cpu, Plug } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Panel } from '../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { BarList } from '../../../ops/charts/BarList';

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
    <OpsPage title="Integrations" description="~1,119 connectors reused as-is from the existing framework (logical/IT layer) + facility/OT connectors built in the same framework.">
      <StatGrid cols={3}>
        <StatTile label="Reusable connectors" value={(1119).toLocaleString('en-IN')} sub={`${CATEGORIES.length} categories · logical / IT layer`} />
        <StatTile label="Facility / OT to build" value={43} sub="power, thermal and GPU telemetry" />
        <StatTile label="P0 (demo the spear)" value={10} sub="needed to demo on live data" />
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title="Reused connector categories" sub="Logical / IT layer" icon={Plug} count={CATEGORIES.length}>
          <BarList items={CATEGORIES.map((c) => ({ key: c.name, label: c.name, sublabel: c.sample, value: c.n }))} />
        </Panel>
        <Panel title="Facility / OT layer" sub="Built in framework — the AI-density gap" icon={Cpu} count={OT_CONNECTORS.length}>
          <div className="col">
            <span className="muted">The 1k library covers IT; these physical/OT connectors power the AI-density spear (power, thermal, GPU) and are built in the same connector framework. P0 = needed to demo on live data.</span>
            <span className="row wrap" style={{ gap: 6 }}>
              {OT_CONNECTORS.map((o) => <Chip key={o.name} tone={o.p0 ? 'purple' : 'neutral'}>{o.p0 ? '★ ' : ''}{o.name}</Chip>)}
            </span>
          </div>
        </Panel>
      </div>
    </OpsPage>
  );
}
