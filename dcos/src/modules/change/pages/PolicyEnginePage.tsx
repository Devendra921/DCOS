import { Link } from 'react-router-dom';
import type { TableColumnType } from 'antd';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import { Chip } from '../../../ops/ui/kit';
import type { Tone } from '../../../ops/lib/tone';
import type { Policy } from '../../../mock/data/types';
import { Note } from '../components/kit';

const enfTone: Record<string, Tone> = { Block: 'error', Warn: 'orange', Audit: 'neutral' };

/** Read-only view of the OPA/Rego policy library as it applies to changes (the Policies tab of /changes).
 *  Authoring is unified in Compliance → Policies (single source of truth). */
export default function PolicyEnginePage() {
  const columns: TableColumnType<Policy>[] = [
    { title: 'Policy', dataIndex: 'name' },
    { title: 'Category', dataIndex: 'category', render: (c: string) => <Chip>{c}</Chip> },
    { title: 'Package', dataIndex: 'regoPackage', render: (v: string) => v ? <code className="mono" style={{ fontSize: 12 }}>{v}</code> : <span className="vw-label">—</span> },
    { title: 'Enforcement', dataIndex: 'enforcement', render: (e: string) => <Chip tone={enfTone[e] ?? 'neutral'}>{e}</Chip> },
    { title: 'Active', dataIndex: 'active', render: (v: boolean) => <Chip tone={v ? 'success' : 'neutral'} dot>{v ? 'Active' : 'Inactive'}</Chip> },
  ];
  return (
    <>
      <Note tone="info">These policies are checked against every change when it is raised and submitted. A blocking policy stops the change; a warning is shown to the approvers. Policies are written and switched on in <Link to="/compliance/policies">Compliance → Policies</Link>.</Note>
      <EntityListPage<Policy> title="Policies checked on changes" entityType="policies" columns={columns} searchPlaceholder="Search policies..." />
    </>
  );
}
