import type { ReactNode } from 'react';
import { Tabs } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import IpamHubPage from './IpamHubPage';
import SubnetListPage from './SubnetListPage';
import AggregatePage from './AggregatePage';
import RirPage from './RirPage';
import IpamRolePage from './IpamRolePage';
import IpAddressPage from './IpAddressPage';
import IpRangePage from './IpRangePage';
import VlanPage from './VlanPage';
import VlanGroupPage from './VlanGroupPage';
import VrfPage from './VrfPage';
import RouteTargetPage from './RouteTargetPage';
import AsnPage from './AsnPage';
import AsnRangePage from './AsnRangePage';
import FhrpGroupPage from './FhrpGroupPage';
import ServiceTemplatePage from './ServiceTemplatePage';
import IpServicePage from './IpServicePage';
import TopologyPage from './TopologyPage';
import IpamIntegrationsPage from './IpamIntegrationsPage';

interface SubTab { label: string; path: string; el: ReactNode }
interface Group { key: string; label: string; tabs: SubTab[] }

const GROUPS: Group[] = [
  { key: 'overview', label: 'Overview', tabs: [{ label: 'Overview', path: '/ipam', el: <IpamHubPage /> }] },
  {
    key: 'prefixes', label: 'Prefixes & Aggregates',
    tabs: [
      { label: 'Prefixes', path: '/ipam/subnets', el: <SubnetListPage /> },
      { label: 'Aggregates', path: '/ipam/aggregates', el: <AggregatePage /> },
      { label: 'RIRs', path: '/ipam/rirs', el: <RirPage /> },
      { label: 'Prefix & VLAN Roles', path: '/ipam/roles', el: <IpamRolePage /> },
    ],
  },
  {
    key: 'ip', label: 'IP Space',
    tabs: [
      { label: 'IP Addresses', path: '/ipam/addresses', el: <IpAddressPage /> },
      { label: 'IP Ranges', path: '/ipam/ranges', el: <IpRangePage /> },
    ],
  },
  {
    key: 'vrf', label: 'VRFs',
    tabs: [
      { label: 'VRFs', path: '/ipam/vrf', el: <VrfPage /> },
      { label: 'Route Targets', path: '/ipam/route-targets', el: <RouteTargetPage /> },
    ],
  },
  {
    key: 'vlan', label: 'VLANs',
    tabs: [
      { label: 'VLANs', path: '/ipam/vlans', el: <VlanPage /> },
      { label: 'VLAN Groups', path: '/ipam/vlan-groups', el: <VlanGroupPage /> },
    ],
  },
  {
    key: 'asn', label: 'ASNs',
    tabs: [
      { label: 'ASNs', path: '/ipam/asns', el: <AsnPage /> },
      { label: 'ASN Ranges', path: '/ipam/asn-ranges', el: <AsnRangePage /> },
    ],
  },
  {
    key: 'services', label: 'Services',
    tabs: [
      { label: 'FHRP Groups', path: '/ipam/fhrp', el: <FhrpGroupPage /> },
      { label: 'Service Templates', path: '/ipam/service-templates', el: <ServiceTemplatePage /> },
      { label: 'Application Services', path: '/ipam/services', el: <IpServicePage /> },
    ],
  },
  { key: 'topology', label: 'Topology', tabs: [{ label: 'Topology', path: '/ipam/topology', el: <TopologyPage /> }] },
  { key: 'integrations', label: 'Integrations', tabs: [{ label: 'Integrations', path: '/ipam/integrations', el: <IpamIntegrationsPage /> }] },
];

const ALL = GROUPS.flatMap((g) => g.tabs);

export default function IpamTabs() {
  const loc = useLocation();
  const navigate = useNavigate();
  const activePath = ALL.find((t) => t.path === loc.pathname)?.path ?? ALL[0].path;
  const activeGroup = GROUPS.find((g) => g.tabs.some((t) => t.path === activePath)) ?? GROUPS[0];
  const activeEl = ALL.find((t) => t.path === activePath)?.el;
  const showSub = activeGroup.tabs.length > 1;

  return (
    <div>
      <div className="vw-card-section" style={{ margin: '8px 0 0' }}>
        <div className="vw-hub-header">
        <Tabs
          className="tabbed-hub-tabs"
          activeKey={activeGroup.key}
          onChange={(k) => { const g = GROUPS.find((x) => x.key === k); if (g) navigate(g.tabs[0].path); }}
          items={GROUPS.map((g) => ({ key: g.key, label: g.label }))}
          style={{ marginBottom: 0 }}
        />
        <div className="vw-hub-actions"><PageDcScopeSelect /></div>
        </div>
        {showSub && (
          <Tabs
            size="small"
            activeKey={activePath}
            onChange={(k) => navigate(k)}
            items={activeGroup.tabs.map((t) => ({ key: t.path, label: t.label }))}
            style={{ marginBottom: 0 }}
          />
        )}
      </div>
      <div style={{ marginTop: "var(--vw-space-lg)" }}>{activeEl}</div>
    </div>
  );
}
