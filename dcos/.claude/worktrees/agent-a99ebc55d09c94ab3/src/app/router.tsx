import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../core/layout/AppLayout';
import LoginPage from './LoginPage';
import MissionControl from './MissionControl';
import {
  FacilityTabs, FacilityMapPage, RackDetailPage, HallFloorPlanPage, DataCenterDrillPage,
} from '../modules/facility';
import { CapacityTabs } from '../modules/capacity';
import { IpamTabs, SubnetDetailPage } from '../modules/ipam';
import { ChangeRoutes } from '../modules/change';
import { NmsTabs, DeviceDetailPage } from '../modules/nms';
import { CircuitsTabs, CircuitDetailPage } from '../modules/circuits';
import { PlanningListPage, PlanWizard, PlanDetailPage } from '../modules/planning';
import { PlannerRoutes } from '../modules/planner';
import { OptimizationHubPage } from '../modules/optimization';
import { OperationsHubPage } from '../modules/operations';
import { ComplianceHub } from '../modules/compliance';
import { IntelligenceTabs } from '../modules/intelligence';
import { DeliveryTabs, ProjectDetailPage, ProgramDetailPage } from '../modules/delivery';
import TicketsRegisterPage from '../modules/delivery/pages/TicketsRegisterPage';
import WorkOrderDetailPage from '../modules/delivery/pages/WorkOrderDetailPage';
import { ProcurementHubPage } from '../modules/procurement';
import { CustomizationHub } from '../modules/customization';
import { CommissioningPage } from '../modules/commissioning';
import { BuildPage } from '../modules/build';
import { Site360Page } from '../modules/site360';
import { DocumentsPage } from '../modules/documents';
import AICopilotPage from '../modules/copilot/pages/AICopilotPage';
import { OnboardingWizard } from '../modules/onboarding';
import { DeviceDetailPage as DcimDeviceDetailPage, DeviceTypeDetailPage } from '../modules/dcim';
// Operate module (merged from dcos-ops): command centre, datacenters, alerts, incidents, changes, facilities, topology
import { OpsShell } from '../ops/shell/OpsShell';
import { CommandCenter } from '../ops/screens/CommandCenter';
import { Datacenters } from '../ops/screens/Datacenters';
import { Site } from '../ops/screens/site/Site';
import { NetworkElement } from '../ops/screens/ne/NetworkElement';
import { Alerts } from '../ops/screens/Alerts';
import { Incidents } from '../ops/screens/Incidents';
import { IncidentDetail } from '../ops/screens/IncidentDetail';
import { Topology } from '../ops/screens/Topology';
import { Facilities } from '../ops/screens/Facilities';
import { ServiceDetail } from '../ops/screens/ServiceDetail';
import { CustomerDetail } from '../ops/screens/CustomerDetail';
import { Services } from '../ops/screens/Services';
import { Customers } from '../ops/screens/Customers';
import { Reconciliation } from '../ops/screens/Reconciliation';
import { Estate } from '../ops/screens/Estate';
import { Locations } from '../ops/screens/Locations';
import { Capacity as CapacityPlans } from '../ops/screens/Capacity';
import { WorkOrdersRoutes } from '../modules/workorders';

/** Mirrors vite.config `base` — React Router expects no trailing slash. */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      path: '/',
      element: <AppLayout />,
      children: [
        { index: true, element: <Navigate to="/operate/command" replace /> },
        { path: 'command-center', element: <MissionControl /> },
        // ── Operate module (ported from dcos-ops) ──
        {
          element: <OpsShell />,
          children: [
            { path: 'operate/command', element: <CommandCenter /> },
            { path: 'datacenters', element: <Datacenters /> },
            { path: 'datacenters/:id', element: <Site /> },
            { path: 'ne/:id', element: <NetworkElement /> },
            { path: 'alerts', element: <Alerts /> },
            { path: 'incidents', element: <Incidents /> },
            { path: 'incidents/:id', element: <IncidentDetail /> },
            { path: 'topology', element: <Topology /> },
            { path: 'facilities', element: <Facilities /> },
            { path: 'services', element: <Services /> },
            { path: 'services/:id', element: <ServiceDetail /> },
            { path: 'customers', element: <Customers /> },
            { path: 'customers/:id', element: <CustomerDetail /> },
            { path: 'reconciliation', element: <Reconciliation /> },
            { path: 'estate', element: <Estate /> },
            { path: 'locations', element: <Locations /> },
            { path: 'inventory/locations', element: <Navigate to="/locations" replace /> },
            { path: 'inventory/*', element: <Navigate to="/estate" replace /> },
            { path: 'capacity/plans', element: <CapacityPlans /> },
          ],
        },
        // ── Work orders (Camunda BPMN processes) ──
        ...WorkOrdersRoutes,
        { path: 'map', element: <FacilityMapPage /> },
        { path: 'onboarding', element: <OnboardingWizard /> },

        // Plan
        ...PlannerRoutes,
        { path: 'planning/legacy', element: <PlanningListPage /> },
        { path: 'planning/legacy/new', element: <PlanWizard /> },
        { path: 'planning/legacy/:planId', element: <PlanDetailPage /> },
        // Capacity — Hub is tabbed (Overview/Space/Reservations/Forecast); Power/Cooling/Compute are leaves
        { path: 'capacity', element: <CapacityTabs /> },
        { path: 'capacity/power', element: <CapacityTabs /> },
        { path: 'capacity/compute', element: <CapacityTabs /> },
        { path: 'capacity/space', element: <CapacityTabs /> },
        { path: 'capacity/pue', element: <CapacityTabs /> },
        // Circuits
        { path: 'circuits', element: <CircuitsTabs /> },
        { path: 'circuits/providers', element: <CircuitsTabs /> },
        { path: 'circuits/types', element: <CircuitsTabs /> },
        { path: 'circuits/:circuitId', element: <CircuitDetailPage /> },
        // IPAM — grouped tabbed hub (NetBox/Inventory-Planning parity)
        { path: 'ipam', element: <IpamTabs /> },
        { path: 'ipam/subnets', element: <IpamTabs /> },
        { path: 'ipam/aggregates', element: <IpamTabs /> },
        { path: 'ipam/rirs', element: <IpamTabs /> },
        { path: 'ipam/roles', element: <IpamTabs /> },
        { path: 'ipam/addresses', element: <IpamTabs /> },
        { path: 'ipam/ranges', element: <IpamTabs /> },
        { path: 'ipam/vrf', element: <IpamTabs /> },
        { path: 'ipam/route-targets', element: <IpamTabs /> },
        { path: 'ipam/vlans', element: <IpamTabs /> },
        { path: 'ipam/vlan-groups', element: <IpamTabs /> },
        { path: 'ipam/asns', element: <IpamTabs /> },
        { path: 'ipam/asn-ranges', element: <IpamTabs /> },
        { path: 'ipam/fhrp', element: <IpamTabs /> },
        { path: 'ipam/service-templates', element: <IpamTabs /> },
        { path: 'ipam/services', element: <IpamTabs /> },
        { path: 'ipam/topology', element: <IpamTabs /> },
        { path: 'ipam/integrations', element: <IpamTabs /> },
        { path: 'ipam/subnets/:subnetId', element: <SubnetDetailPage /> },
        // Facility
        { path: 'facility', element: <FacilityTabs /> },
        { path: 'facility/halls', element: <FacilityTabs /> },
        { path: 'facility/racks', element: <FacilityTabs /> },
        { path: 'facility/explorer', element: <FacilityTabs /> },
        { path: 'facility/catalog', element: <FacilityTabs /> },
        { path: 'facility/dc-types', element: <FacilityTabs /> },
        { path: 'facility/sites', element: <FacilityTabs /> },
        { path: 'facility/device-types', element: <FacilityTabs /> },
        { path: 'facility/module-types', element: <FacilityTabs /> },
        { path: 'facility/devices', element: <FacilityTabs /> },
        { path: 'facility/cabling', element: <FacilityTabs /> },
        { path: 'facility/power-dist', element: <FacilityTabs /> },
        { path: 'facility/device-types/:dtId', element: <DeviceTypeDetailPage /> },
        { path: 'facility/devices/:deviceId', element: <DcimDeviceDetailPage /> },
        { path: 'facility/dc/:dcId', element: <DataCenterDrillPage /> },
        { path: 'facility/dc/:dcId/site360', element: <Site360Page /> },
        { path: 'facility/hall/:hallId', element: <HallFloorPlanPage /> },
        { path: 'facility/racks/:rackId', element: <RackDetailPage /> },

        // Deliver
        { path: 'delivery', element: <DeliveryTabs /> },
        { path: 'delivery/portfolio', element: <Navigate to="/delivery/projects" replace /> },
        { path: 'delivery/programs', element: <DeliveryTabs /> },
        { path: 'delivery/projects', element: <DeliveryTabs /> },
        { path: 'delivery/work-orders', element: <DeliveryTabs /> },
        { path: 'delivery/work-orders/:workOrderId', element: <WorkOrderDetailPage /> },
        { path: 'delivery/my-tasks', element: <DeliveryTabs /> },
        { path: 'delivery/tickets', element: <TicketsRegisterPage /> },
        { path: 'delivery/permits', element: <DeliveryTabs /> },
        { path: 'delivery/design', element: <DeliveryTabs /> },
        { path: 'delivery/projects/:projectId', element: <ProjectDetailPage /> },
        { path: 'delivery/programs/:programId', element: <ProgramDetailPage /> },
        { path: 'procurement', element: <ProcurementHubPage /> },
        { path: 'commissioning', element: <CommissioningPage /> },
        { path: 'build', element: <BuildPage /> },

        // Operate
        { path: 'operations', element: <OperationsHubPage /> },
        // Changes — one module for every change request (/changes, /changes/new, /changes/:changeId); old /change… paths redirect
        ...ChangeRoutes,
        // NMS — kept expanded
        { path: 'nms', element: <NmsTabs /> },
        { path: 'nms/alarms', element: <NmsTabs /> },
        { path: 'nms/devices', element: <NmsTabs /> },
        { path: 'nms/performance', element: <NmsTabs /> },
        { path: 'nms/config', element: <NmsTabs /> },
        { path: 'nms/discovery', element: <NmsTabs /> },
        { path: 'nms/telemetry', element: <NmsTabs /> },
        { path: 'nms/discovery-live', element: <NmsTabs /> },
        { path: 'nms/predictive', element: <NmsTabs /> },
        { path: 'nms/devices/:deviceId', element: <DeviceDetailPage /> },

        // Insights
        { path: 'optimization', element: <OptimizationHubPage /> },
        // Compliance hub — Posture · Policies (Rego) · Controls · Violations · Decision Records · Audit
        { path: 'compliance', element: <ComplianceHub /> },
        { path: 'compliance/policies', element: <ComplianceHub /> },
        { path: 'compliance/controls', element: <ComplianceHub /> },
        { path: 'compliance/violations', element: <ComplianceHub /> },
        { path: 'compliance/decisions', element: <ComplianceHub /> },
        { path: 'audit', element: <ComplianceHub /> },
        // Topology & Dependencies — Digital Twin · Dataflow & Impact
        { path: 'intelligence', element: <IntelligenceTabs /> },

        // Customization — custom fields & tags
        { path: 'customization', element: <CustomizationHub /> },
        { path: 'customization/tags', element: <CustomizationHub /> },

        // Workspace
        { path: 'documents', element: <DocumentsPage /> },
        { path: 'copilot', element: <AICopilotPage /> },
      ],
    },
  ],
  { basename },
);
