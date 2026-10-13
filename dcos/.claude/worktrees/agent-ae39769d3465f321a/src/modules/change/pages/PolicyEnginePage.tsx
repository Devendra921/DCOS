import { Link } from 'react-router-dom';
import { Typography } from 'antd';
import type { TableColumnType } from 'antd';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import { VwCard, VwChip } from '../../../shared/components/ux';
import type { Policy } from '../../../mock/data/types';

const { Text } = Typography;
const enfColor: Record<string, string> = { Block: 'red', Warn: 'orange', Audit: 'default' };

/** Read-only view of the OPA/Rego policy library as it applies to changes.
 *  Authoring is unified in Compliance → Policies (single source of truth). */
export default function PolicyEnginePage() {
  const columns: TableColumnType<Policy>[] = [
    { title: 'Policy', dataIndex: 'name' },
    { title: 'Category', dataIndex: 'category', render: (c: string) => <VwChip>{c}</VwChip> },
    { title: 'Package', dataIndex: 'regoPackage', render: (v: string) => v ? <code style={{ fontSize: "var(--vw-font-label-sm)" }}>{v}</code> : <Text type="secondary">—</Text> },
    { title: 'Enforcement', dataIndex: 'enforcement', render: (e: string) => <VwChip color={enfColor[e]}>{e}</VwChip> },
    { title: 'Active', dataIndex: 'active', render: (v: boolean) => <VwChip color={v ? 'green' : 'default'}>{v ? 'Active' : 'Inactive'}</VwChip> },
  ];
  return (
    <div className="vw-flex vw-flex-col vw-gap-md">
      <VwCard variant="child" tone="info">
        <div className="vw-card-description">These policies are checked against every change when it is raised and submitted. A blocking policy stops the change; a warning is shown to the approvers. Policies are written and switched on in <Link to="/compliance/policies">Compliance → Policies</Link>.</div>
      </VwCard>
      <EntityListPage<Policy> title="Policies checked on changes" entityType="policies" columns={columns} searchPlaceholder="Search policies..." />
    </div>
  );
}
