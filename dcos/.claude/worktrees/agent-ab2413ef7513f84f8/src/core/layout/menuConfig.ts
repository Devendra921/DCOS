/**
 * DCOS — Navigation IA v3 (unified product).
 * Seven journey-ordered areas: Command centre · Estate · Plan & Build · Operate · Capacity · Work orders · Admin.
 * Operate screens come from the merged dcos-ops module (src/ops); the rest are the DCOS modules.
 */
import {
  HomeOutlined, AimOutlined, RiseOutlined, ThunderboltOutlined, DeploymentUnitOutlined,
  ApartmentOutlined, GlobalOutlined, ProjectOutlined, DollarOutlined,
  CheckCircleOutlined, DashboardOutlined, AlertOutlined, SwapOutlined,
  RadarChartOutlined, PartitionOutlined, SafetyCertificateOutlined, SettingOutlined,
  FileTextOutlined, BulbOutlined, TagsOutlined, ToolOutlined, AuditOutlined, UserOutlined,
  BellOutlined, FireOutlined, EnvironmentOutlined, ClusterOutlined, BranchesOutlined, UnorderedListOutlined,
} from '../../shared/icons';

export interface MenuItem {
  key: string;
  label: string;
  icon: any;
  path?: string;
  moduleCode?: string;
  children?: MenuItem[];
  integration?: boolean;
  integrationSource?: string;
  tooltip?: string;
  intDisabled?: boolean;
}

export const INT_DISABLED_LIVE = false;

export const menuItems: MenuItem[] = [
  { key: 'home', label: 'Command centre', icon: HomeOutlined, path: '/operate/command', moduleCode: 'CMD' },

  {
    key: 'estate', label: 'Estate', icon: ApartmentOutlined,
    children: [
      { key: 'estate-overview', label: 'Estate overview', icon: GlobalOutlined, path: '/estate', moduleCode: 'EST', tooltip: 'Hierarchy, coverage and geography of the whole estate' },
      { key: 'datacenters', label: 'Datacenters', icon: EnvironmentOutlined, path: '/datacenters', moduleCode: 'DC', tooltip: 'Operational state of every site' },
      { key: 'locations', label: 'Locations', icon: EnvironmentOutlined, path: '/locations', moduleCode: 'LOC' },
      { key: 'facility', label: 'DCIM · Sites, halls, racks', icon: ApartmentOutlined, path: '/facility', moduleCode: 'FAC' },
      { key: 'map', label: 'Site map', icon: GlobalOutlined, path: '/map', moduleCode: 'MAP' },
      { key: 'ipam', label: 'IP & Network', icon: DeploymentUnitOutlined, path: '/ipam', moduleCode: 'IPAM' },
      { key: 'circuits', label: 'Circuits', icon: PartitionOutlined, path: '/circuits', moduleCode: 'CKT' },
      { key: 'customers', label: 'Customers & services', icon: UserOutlined, path: '/customers', moduleCode: 'CUST' },
      { key: 'documents', label: 'Knowledge center', icon: FileTextOutlined, path: '/documents', moduleCode: 'DOC' },
    ],
  },
  {
    key: 'plan', label: 'Plan & Build', icon: AimOutlined,
    children: [
      { key: 'planning', label: 'Planner', icon: RiseOutlined, path: '/planning', moduleCode: 'PLAN', tooltip: 'Plans, new plan wizard, templates, benchmarks and rules, AI' },
      { key: 'delivery', label: 'Delivery', icon: ProjectOutlined, path: '/delivery', moduleCode: 'PROG', tooltip: 'Programmes, projects, work orders, my tasks, permits and design' },
      { key: 'procurement', label: 'Procurement', icon: DollarOutlined, path: '/procurement', moduleCode: 'PROC' },
      { key: 'commissioning', label: 'Commissioning', icon: CheckCircleOutlined, path: '/commissioning', moduleCode: 'CMS' },
      { key: 'onboarding', label: 'Onboard a site', icon: ClusterOutlined, path: '/onboarding', moduleCode: 'ONB' },
      { key: 'reconciliation', label: 'Reconciliation', icon: BranchesOutlined, path: '/reconciliation', moduleCode: 'REC', tooltip: 'Discovery drift and not-discovered records' },
      { key: 'tickets', label: 'Tickets', icon: TagsOutlined, path: '/delivery/tickets', moduleCode: 'TKT' },
    ],
  },
  {
    key: 'operate', label: 'Operate', icon: DashboardOutlined,
    children: [
      { key: 'alerts', label: 'Alerts', icon: BellOutlined, path: '/alerts', moduleCode: 'ALM' },
      { key: 'incidents', label: 'Incidents', icon: AlertOutlined, path: '/incidents', moduleCode: 'INC' },
      { key: 'changes', label: 'Changes & maintenance', icon: SwapOutlined, path: '/changes', moduleCode: 'CHG' },
      { key: 'facilities', label: 'Facilities', icon: FireOutlined, path: '/facilities', moduleCode: 'FCL', tooltip: 'Power path, ride-through, cooling, environment' },
      { key: 'topology', label: 'Topology', icon: RadarChartOutlined, path: '/topology', moduleCode: 'TOPO' },
      { key: 'nms', label: 'Network operations', icon: ClusterOutlined, path: '/nms', moduleCode: 'NMS' },
      { key: 'change', label: 'Change governance', icon: SafetyCertificateOutlined, path: '/change', moduleCode: 'GOV', tooltip: 'Approvals, policies and the change wizard' },
      { key: 'operations', label: 'Operations hub', icon: DashboardOutlined, path: '/operations', moduleCode: 'OPS' },
    ],
  },
  {
    key: 'capacity-area', label: 'Capacity', icon: ThunderboltOutlined,
    children: [
      { key: 'capacity', label: 'Capacity', icon: ThunderboltOutlined, path: '/capacity', moduleCode: 'CAP' },
      { key: 'capacity-plans', label: 'Plans & forecast', icon: RiseOutlined, path: '/capacity/plans', moduleCode: 'CPL' },
      { key: 'optimization', label: 'Optimisation', icon: BulbOutlined, path: '/optimization', moduleCode: 'OPT' },
      { key: 'intelligence', label: 'Dependencies', icon: PartitionOutlined, path: '/intelligence', moduleCode: 'INT' },
    ],
  },
  {
    key: 'workorders-area', label: 'Work orders', icon: ToolOutlined,
    children: [
      { key: 'workorders', label: 'Processes', icon: BranchesOutlined, path: '/workorders', moduleCode: 'WOP', tooltip: 'Camunda BPMN process catalogue' },
      { key: 'workorders-instances', label: 'Work orders', icon: UnorderedListOutlined, path: '/workorders/instances', moduleCode: 'WOI' },
      { key: 'workorders-tasks', label: 'My tasks', icon: CheckCircleOutlined, path: '/workorders/tasks', moduleCode: 'WOT' },
      { key: 'workorders-kpis', label: 'Process KPIs', icon: DashboardOutlined, path: '/workorders/kpis', moduleCode: 'WOK' },
      { key: 'build', label: 'Field work (legacy)', icon: ToolOutlined, path: '/build', moduleCode: 'BLD' },
    ],
  },
  {
    key: 'admin', label: 'Admin', icon: SettingOutlined,
    children: [
      { key: 'customization', label: 'Customization', icon: SettingOutlined, path: '/customization', moduleCode: 'CFG' },
      { key: 'compliance', label: 'Compliance', icon: SafetyCertificateOutlined, path: '/compliance', moduleCode: 'CMP' },
      { key: 'audit', label: 'Audit', icon: AuditOutlined, path: '/audit', moduleCode: 'AUD' },
    ],
  },
];
