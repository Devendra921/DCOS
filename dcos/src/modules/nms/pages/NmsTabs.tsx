import { TabbedHub } from '../../../shared/components/ux/TabbedHub';
import NmsHubPage from './NmsHubPage';
import AlarmConsolePage from './AlarmConsolePage';
import DeviceListPage from './DeviceListPage';
import PerformancePage from './PerformancePage';
import ConfigManagementPage from './ConfigManagementPage';
import DiscoveryTopologyPage from './DiscoveryTopologyPage';
import { TelemetryPreview, DiscoveryPreview, PredictivePreview } from '../../futurestate';
export default function NmsTabs() {
  return <TabbedHub title="Network management" description="Fleet health, alarms, devices, performance and configuration for every managed device." tabs={[
    { label: 'Network Health', path: '/nms', el: <NmsHubPage /> },
    { label: 'Alarms', path: '/nms/alarms', el: <AlarmConsolePage /> },
    { label: 'Managed Devices', path: '/nms/devices', el: <DeviceListPage /> },
    { label: 'Performance', path: '/nms/performance', el: <PerformancePage /> },
    { label: 'Config Management', path: '/nms/config', el: <ConfigManagementPage /> },
    { label: 'Discovery & Topology', path: '/nms/discovery', el: <DiscoveryTopologyPage /> },
    { label: 'Live Telemetry', path: '/nms/telemetry', el: <TelemetryPreview /> },
    { label: 'Discovery & Ingestion', path: '/nms/discovery-live', el: <DiscoveryPreview /> },
    { label: 'Predictive', path: '/nms/predictive', el: <PredictivePreview /> },
  ]} />;
}
