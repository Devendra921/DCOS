import { Typography } from 'antd';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { VwCard, VwChip } from '../../../shared/components/ux';
const { Text } = Typography;

const PERSPECTIVES = [
  { code: 'R01', label: 'Administrator', tier: 'system', authority: 'admin', density: 'standard', home: '/' },
  { code: 'R02', label: 'Executive', tier: 'strategic', authority: 'govern', density: 'comfortable', home: '/' },
  { code: 'R03', label: 'Facility / DC Manager', tier: 'management', authority: 'govern', density: 'standard', home: '/facility' },
  { code: 'R04', label: 'Capacity Planner', tier: 'engineering', authority: 'contribute', density: 'expert', home: '/capacity' },
  { code: 'R05', label: 'Network Engineer', tier: 'engineering', authority: 'contribute', density: 'expert', home: '/ipam' },
  { code: 'R06', label: 'Delivery Manager', tier: 'management', authority: 'approve', density: 'standard', home: '/delivery' },
  { code: 'R07', label: 'Change Approver', tier: 'management', authority: 'govern', density: 'standard', home: '/change' },
  { code: 'R08', label: 'NOC / Operations', tier: 'operations', authority: 'contribute', density: 'expert', home: '/nms' },
  { code: 'R09', label: 'Field Technician', tier: 'field', authority: 'contribute', density: 'comfortable', home: '/build' },
  { code: 'R10', label: 'Compliance Auditor', tier: 'external', authority: 'view', density: 'standard', home: '/compliance' },
];

export default function AdminPage() {
  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3} style={{ marginBottom: "var(--vw-space-lg)" }}>Administration</div>
      <VwCard size="small" title="Perspectives & Capabilities">
        <Text type="secondary">10 role perspectives drive navigation breadth, UI density, capabilities, and AI tone. Currently running single-admin in the prototype.</Text>
        <Table size="small" rowKey="code" style={{ marginTop: "var(--vw-space-md)" }} dataSource={PERSPECTIVES} pagination={false} scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Code', dataIndex: 'code' },
            { title: 'Perspective', dataIndex: 'label' },
            { title: 'Tier', dataIndex: 'tier', render: (t) => <VwChip>{t}</VwChip> },
            { title: 'Authority', dataIndex: 'authority', render: (a) => <VwChip color={a === 'admin' || a === 'govern' ? 'red' : a === 'approve' ? 'orange' : 'blue'}>{a}</VwChip> },
            { title: 'Density', dataIndex: 'density' },
            { title: 'Home', dataIndex: 'home', render: (h) => <span>{h}</span> },
          ]} />
      </VwCard>
    </div>
  );
}
