import { ModulePageBody } from '../../../shared/components/ops/ModulePageBody';
import type { ReactNode } from 'react';
import { ModuleHeader } from '../../../shared/components/ux/ModuleHeader';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { PlusSquareOutlined } from '../../../shared/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
import FacilityHierarchyPage from './FacilityHierarchyPage';
import HallFloorPlanPage from './HallFloorPlanPage';
import RackListPage from './RackListPage';
import ExplorerPage from './ExplorerPage';
import DcTypesPage from './DcTypesPage';
import SitesPage from './SitesPage';
import { DeviceTypesPage, DevicesPage, CablingPage, ModuleTypesPage, CatalogPage, PowerPage } from '../../dcim';

interface SubTab { label: string; path: string; el: ReactNode }
interface Group { key: string; label: string; tabs: SubTab[] }

const GROUPS: Group[] = [
  {
    key: 'physical', label: 'Physical',
    tabs: [
      { label: 'Sites', path: '/facility/sites', el: <SitesPage /> },
      { label: 'Explorer', path: '/facility/explorer', el: <ExplorerPage /> },
      { label: 'Hierarchy', path: '/facility', el: <FacilityHierarchyPage /> },
      { label: 'Halls & Floor Plans', path: '/facility/halls', el: <HallFloorPlanPage /> },
      { label: 'Racks', path: '/facility/racks', el: <RackListPage /> },
      { label: 'Power', path: '/facility/power-dist', el: <PowerPage /> },
    ],
  },
  {
    key: 'inventory', label: 'Inventory',
    tabs: [
      { label: 'Catalog', path: '/facility/catalog', el: <CatalogPage /> },
      { label: 'DC Types', path: '/facility/dc-types', el: <DcTypesPage /> },
      { label: 'Device Types', path: '/facility/device-types', el: <DeviceTypesPage /> },
      { label: 'Module Types', path: '/facility/module-types', el: <ModuleTypesPage /> },
      { label: 'Devices', path: '/facility/devices', el: <DevicesPage /> },
    ],
  },
  {
    key: 'connectivity', label: 'Connectivity',
    tabs: [
      { label: 'Cabling', path: '/facility/cabling', el: <CablingPage /> },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.tabs);

export default function FacilityTabs() {
  const loc = useLocation();
  const navigate = useNavigate();
  const activePath = ALL.find((t) => t.path === loc.pathname)?.path ?? ALL[0].path;
  const activeGroup = GROUPS.find((g) => g.tabs.some((t) => t.path === activePath)) ?? GROUPS[0];
  const activeEl = ALL.find((t) => t.path === activePath)?.el;

  return (
    <div className={`vw-flex vw-flex-col${activePath === '/facility/power-dist' ? ' facility-page--power' : ''}`} style={{ minWidth: 0 }}>
      <ModuleHeader title="DCIM" description="Sites, halls, racks, devices, power and cabling for every data center."
        actions={<>
          <PageDcScopeSelect />
          <Button type="primary" icon={<PlusSquareOutlined />} onClick={() => navigate('/onboarding')}>Onboard data center</Button>
        </>}
        tabs={GROUPS.map((g) => ({ value: g.key, label: g.label }))} active={activeGroup.key}
        onTab={(k) => { const g = GROUPS.find((x) => x.key === k); if (g) navigate(g.tabs[0].path); }}
        subTabs={activeGroup.tabs.map((t) => ({ value: t.path, label: t.label }))} subActive={activePath} onSub={(k) => navigate(k)} />
      <ModulePageBody overview={activePath === ALL[0].path}>{activeEl}</ModulePageBody>
    </div>
  );
}
