import { TabbedHub } from '../../../shared/components/ux/TabbedHub';
import CompliancePage from './CompliancePage';
import PoliciesPage from './PoliciesPage';
import ControlsPage from './ControlsPage';
import ViolationsPage from './ViolationsPage';
import DecisionRecordsPage from './DecisionRecordsPage';
import { AuditPage } from '../../audit';

/** Compliance & policy-as-code — OPA/Rego policies, framework controls,
 *  violations, the OPA decision log, and the audit trail in one hub. */
export default function ComplianceHub() {
  return <TabbedHub tabs={[
    { label: 'Posture', path: '/compliance', el: <CompliancePage /> },
    { label: 'Policies', path: '/compliance/policies', el: <PoliciesPage /> },
    { label: 'Frameworks & Controls', path: '/compliance/controls', el: <ControlsPage /> },
    { label: 'Policy Violations', path: '/compliance/violations', el: <ViolationsPage /> },
    { label: 'Decision Records', path: '/compliance/decisions', el: <DecisionRecordsPage /> },
    { label: 'Audit', path: '/audit', el: <AuditPage /> },
  ]} />;
}
