/* Delivery hub — the 'delivery' menu entry. All tabs visible, each with its own URL:
   /delivery (overview), /delivery/programs, /delivery/projects, /delivery/work-orders,
   /delivery/my-tasks, /delivery/permits, /delivery/design. Only the active tab is mounted. */
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ModuleHeader } from '../../../shared/components/ux/ModuleHeader';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { PlusOutlined } from '../../../shared/icons';
import { useDeliveryData, isOpenWorkOrder } from '../lib/chain';
import NewProgramModal from '../components/NewProgramModal';
import NewProjectWizard from '../components/NewProjectWizard';
import DeliveryCommandCentre from './DeliveryCommandCentre';
import { ProgrammesPage, ProjectsPage } from './PortfolioHubPage';
import WorkOrdersPage from './WorkOrdersPage';
import MyTasksPage from './MyTasksPage';
import PermitsRegisterPage from './PermitsRegisterPage';
import DesignRegisterPage from './DesignRegisterPage';

interface HubTab { key: string; label: string; path: string; badge?: ReactNode; el: () => ReactNode }

export default function DeliveryTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const d = useDeliveryData();
  const [newProgram, setNewProgram] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const openWo = d.workOrders.filter(isOpenWorkOrder).length;
  const tabs: HubTab[] = [
    { key: 'overview', label: 'Overview', path: '/delivery', el: () => <DeliveryCommandCentre /> },
    { key: 'programs', label: 'Programmes', path: '/delivery/programs', badge: d.ready ? d.programs.length : undefined, el: () => <ProgrammesPage /> },
    { key: 'projects', label: 'Projects', path: '/delivery/projects', badge: d.ready ? d.projects.length : undefined, el: () => <ProjectsPage /> },
    { key: 'work-orders', label: 'Work orders', path: '/delivery/work-orders', badge: d.ready && openWo ? openWo : undefined, el: () => <WorkOrdersPage /> },
    { key: 'my-tasks', label: 'My tasks', path: '/delivery/my-tasks', el: () => <MyTasksPage /> },
    { key: 'permits', label: 'Permits', path: '/delivery/permits', el: () => <PermitsRegisterPage /> },
    { key: 'design', label: 'Design', path: '/delivery/design', el: () => <DesignRegisterPage /> },
  ];
  const active = tabs.find(t => t.path === pathname.replace(/\/$/, '')) ?? tabs[0];

  return (
    <div className="vw-flex vw-flex-col" style={{ minWidth: 0 }}>
      <ModuleHeader title="Delivery" description="Approved plans become programmes and projects; projects raise work orders, and every work order carries its change request."
        actions={<>
          <Button icon={<PlusOutlined />} onClick={() => setNewProgram(true)}>New programme</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewProject(true)}>New project</Button>
        </>}
        tabs={tabs.map(t => ({ value: t.key, label: <>{t.label}{t.badge !== undefined && <span className="mh-badge">{t.badge}</span>}</> }))} active={active.key} onTab={k => navigate(tabs.find(t => t.key === k)!.path)} />
      <div style={{ minWidth: 0 }}>{active.el()}</div>

      <NewProgramModal open={newProgram} onClose={() => setNewProgram(false)} onCreated={id => navigate(`/delivery/programs/${id}`)} />
      <NewProjectWizard open={newProject} onClose={() => setNewProject(false)} onCreated={id => navigate(`/delivery/projects/${id}`)} />
    </div>
  );
}
