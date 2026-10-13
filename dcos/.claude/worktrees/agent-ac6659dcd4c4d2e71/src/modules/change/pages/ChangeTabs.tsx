import { TabbedHub } from '../../../shared/components/ux/TabbedHub';
import ChangeQueuePage from './ChangeQueuePage';
import MyApprovalsPage from './MyApprovalsPage';
import PolicyEnginePage from './PolicyEnginePage';
export default function ChangeTabs() {
  return <TabbedHub tabs={[
    { label: 'Change Queue', path: '/change', el: <ChangeQueuePage /> },
    { label: 'My Approvals', path: '/change/approvals', el: <MyApprovalsPage /> },
    { label: 'Policy Engine', path: '/governance/policies', el: <PolicyEnginePage /> },
  ]} />;
}
