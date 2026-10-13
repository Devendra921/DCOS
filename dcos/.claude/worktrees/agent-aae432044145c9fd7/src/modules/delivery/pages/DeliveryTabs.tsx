import { TabbedHub } from '../../../shared/components/ux/TabbedHub';
import DeliveryCommandCentre from './DeliveryCommandCentre';
import PortfolioHubPage from './PortfolioHubPage';
import MyTasksPage from './MyTasksPage';
import PermitsRegisterPage from './PermitsRegisterPage';
import DesignRegisterPage from './DesignRegisterPage';

export default function DeliveryTabs() {
  return <TabbedHub tabs={[
    { label: 'Command Center', path: '/delivery', el: <DeliveryCommandCentre /> },
    { label: 'Portfolio', path: '/delivery/portfolio', el: <PortfolioHubPage /> },
    { label: 'My Tasks', path: '/delivery/my-tasks', el: <MyTasksPage /> },
    { label: 'Permits', path: '/delivery/permits', el: <PermitsRegisterPage /> },
    { label: 'Design', path: '/delivery/design', el: <DesignRegisterPage /> },
  ]} />;
}
