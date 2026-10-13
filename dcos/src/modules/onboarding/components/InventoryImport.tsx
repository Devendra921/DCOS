import { useState } from 'react';
import { Input, Upload, Alert, Space, Typography } from 'antd';
import { Upload as UploadIcon, Zap } from 'lucide-react';
import { Btn, Chip } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { parseInventoryCsv, SAMPLE_INVENTORY_CSV, type RackImportRow, type HallDraft } from '../lib/commit';

type Row = RackImportRow & { id: string };

const { Text } = Typography;
const { TextArea } = Input;

export interface InventoryImportProps {
  value: RackImportRow[];
  onChange: (rows: RackImportRow[]) => void;
  halls: HallDraft[];
}

/** CSV paste/upload → parsed rack rows that populate the halls from step 2. */
export function InventoryImport({ value, onChange, halls }: InventoryImportProps) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  function parse(raw: string) {
    setText(raw);
    if (!raw.trim()) { onChange([]); setErrors([]); return; }
    const { rows, errors } = parseInventoryCsv(raw);
    onChange(rows);
    setErrors(errors);
  }

  const hallNames = new Set(halls.map((h) => h.name.trim().toLowerCase()));
  const matched = value.filter((r) => hallNames.has((r.hall || '').trim().toLowerCase())).length;
  const unmatched = value.length - matched;
  const rows: Row[] = value.map((r, i) => ({ ...r, id: String(i) }));
  const cols: Col<Row>[] = [
    { key: 'hall', header: 'Hall', render: (r) => (hallNames.has((r.hall || '').trim().toLowerCase()) ? r.hall : <Text type="warning">{r.hall || '—'}</Text>) },
    { key: 'name', header: 'Rack', render: (r) => <span className="mono">{r.name}</span> },
    { key: 'purpose', header: 'Purpose', render: (r) => <Chip tone="neutral">{r.purpose}</Chip> },
    { key: 'u', header: 'U used', align: 'right', render: (r) => <span className="num">{r.usedU}/{r.heightU}</span> },
    { key: 'kw', header: 'Power kW', align: 'right', render: (r) => <span className="num">{r.currentPowerKw}/{r.maxPowerKw}</span> },
  ];

  return (
    <div>
      <Alert
        type="info"
        style={{ marginBottom: "var(--vw-space-md)" }}
        message="Paste or upload a rack inventory export"
        description={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Columns: hall, row, rack, purpose, heightU, usedU, maxPowerKw, currentPowerKw. Racks are placed into the halls defined on the floor plan, matched by hall name.</Text>}
      />
      <Space style={{ marginBottom: 10 }} wrap>
        <Upload
          accept=".csv,text/csv"
          showUploadList={false}
          beforeUpload={(f) => {
            const reader = new FileReader();
            reader.onload = () => parse(reader.result as string);
            reader.readAsText(f);
            return false;
          }}
        >
          <Btn icon={UploadIcon}>Upload CSV</Btn>
        </Upload>
        <Btn icon={Zap} onClick={() => parse(SAMPLE_INVENTORY_CSV)}>Load sample</Btn>
        {value.length > 0 && <Chip tone="info">{value.length} racks</Chip>}
        {matched > 0 && <Chip tone="success" dot>{matched} matched to halls</Chip>}
        {unmatched > 0 && <Chip tone="orange" dot>{unmatched} unmatched (will be skipped)</Chip>}
      </Space>

      <TextArea
        value={text}
        onChange={(e) => parse(e.target.value)}
        placeholder={SAMPLE_INVENTORY_CSV}
        autoSize={{ minRows: 5, maxRows: 9 }}
        style={{ fontSize: "var(--vw-font-label-sm)" }}
      />

      {errors.length > 0 && (
        <Alert type="warning" style={{ marginTop: 10 }} message={errors.join(' · ')} />
      )}

      {value.length > 0 && (
        <div style={{ marginTop: "var(--vw-space-md)", border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          <DataTable<Row> compact rows={rows} cols={cols} maxHeight={320} pageSize={Math.max(25, rows.length)} />
        </div>
      )}
    </div>
  );
}

export default InventoryImport;
