import { useNavigate } from 'react-router-dom';
import { Alert, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import type { TableColumnType } from 'antd';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import { VwChip } from '../../../shared/components/ux';
import type { Policy } from '../../../mock/data/types';

const { Text } = Typography;
const enfColor: Record<string, string> = { Block: 'red', Warn: 'orange', Audit: 'default' };

/** Read-only view of the OPA/Rego policy library as it applies to changes.
 *  Authoring is unified in Compliance → Policies (single source of truth). */
export default function PolicyEnginePage() {
  const navigate = useNavigate();
  const columns: TableColumnType<Policy>[] = [
    { title: 'Policy', dataIndex: 'name' },
    { title: 'Category', dataIndex: 'category', render: (c: string) => <VwChip>{c}</VwChip> },
    { title: 'Package', dataIndex: 'regoPackage', render: (v: string) => v ? <code style={{ fontSize: "var(--vw-font-label-sm)" }}>{v}</code> : <Text type="secondary">—</Text> },
    { title: 'Enforcement', dataIndex: 'enforcement', render: (e: string) => <VwChip color={enfColor[e]}>{e}</VwChip> },
    { title: 'Active', dataIndex: 'active', render: (v: boolean) => <VwChip color={v ? 'green' : 'default'}>{v ? 'Active' : 'Inactive'}</VwChip> },
  ];
  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: "var(--vw-space-md)" }}
        message="Guardrails applied at change-time"
        description={<>
          These OPA policies are evaluated against every change. Authoring and enforcement settings are managed centrally in Compliance → Policies.
          <div style={{ marginTop: "var(--vw-space-sm)" }}><Button size="small" onClick={() => navigate('/compliance/policies')}>Open Compliance → Policies</Button></div>
        </>}
      />
      <EntityListPage<Policy> title="Policy Engine (read-only)" entityType="policies" columns={columns} searchPlaceholder="Search policies..." />
    </div>
  );
}
