import { TabbedHub } from '../../../shared/components/ux/TabbedHub';
import NmsHubPage from './NmsHubPage';
import AlarmConsolePage from './AlarmConsolePage';
import DeviceListPage from './DeviceListPage';
import PerformancePage from './PerformancePage';
import ConfigManagementPage from './ConfigManagementPage';
import DiscoveryTopologyPage from './DiscoveryTopologyPage';
import { TelemetryPreview, DiscoveryPreview, PredictivePreview } from '../../futurestate';
export default function NmsTabs() {
  return <TabbedHub tabs={[
    { label: 'Network Health', path: '/nms', el: <NmsHubPage /> },
    { label: 'Alarms', path: '/nms/alarms', el: <AlarmConsolePage /> },
    { label: 'Managed Devices', path: '/nms/devices', el: <DeviceListPage /> },
    { label: 'Performance', path: '/nms/performance', el: <PerformancePage /> },
    { label: 'Config Management', path: '/nms/config', el: <ConfigManagementPage /> },
    { label: 'Discovery & Topology', path: '/nms/discovery', el: <DiscoveryTopologyPage /> },
    { label: 'Live Telemetry (preview)', path: '/nms/telemetry', el: <TelemetryPreview /> },
    { label: 'Discovery & Ingestion (preview)', path: '/nms/discovery-live', el: <DiscoveryPreview /> },
    { label: 'Predictive (preview)', path: '/nms/predictive', el: <PredictivePreview /> },
  ]} />;
}
