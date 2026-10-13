import type { ReactNode } from 'react';
import { Typography, Space } from 'antd';
import { ApiOutlined } from '../../../shared/icons';
import { VwCard } from '../../../shared/components/ux';

const { Text } = Typography;

export interface DataContractField { name: string; desc: string; }
export interface DataContractProps {
  sources: string[];
  cadence: string;
  fields: DataContractField[];
  notes?: string[];
}

/** The callout that turns a mockup into a backend specification. */
export function DataContract({ sources, cadence, fields, notes }: DataContractProps) {
  return (
    <VwCard
      size="small"
      style={{ marginTop: "var(--vw-space-lg)", borderColor: '#d3adf7', background: "var(--vw-color-purple-50)" }}
      title={<span><ApiOutlined /> Backend data contract — what this screen needs to go live</span>}
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Text><b>Source systems:</b> {sources.join('  ·  ')}</Text>
        <Text><b>Refresh cadence:</b> {cadence}</Text>
        <div>
          <Text strong>Required fields</Text>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {fields.map((f) => (
              <li key={f.name}><code style={{ background: '#f1e9fc', padding: '0 4px', borderRadius: 3 }}>{f.name}</code> — {f.desc}</li>
            ))}
          </ul>
        </div>
        {notes && notes.length > 0 && (
          <div>
            <Text strong>Notes for backend</Text>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}
      </Space>
    </VwCard>
  );
}

/** Standard wrapper: title + content + data contract. */
export function PreviewPage({
  title, children, contract,
}: { title: string; subtitle: string; children: ReactNode; contract: DataContractProps }) {
  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3} style={{ marginBottom: "var(--vw-space-md)" }}>{title}</div>
      {children}
      <DataContract {...contract} />
    </div>
  );
}
