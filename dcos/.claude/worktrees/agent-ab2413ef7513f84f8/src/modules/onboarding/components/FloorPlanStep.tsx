import { useState } from 'react';
import { Tabs, Input, Space, Typography } from 'antd';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import type { FloorDraft, HallDraft } from '../lib/commit';

const { Text } = Typography;
let fseq = 0;
const newFloorId = () => `f-local-${Date.now().toString(36)}-${fseq++}`;

export interface FloorPlanStepProps {
  value: FloorDraft[];
  onChange: (floors: FloorDraft[]) => void;
}

/**
 * Building → Floors → Halls. Each floor is a tab with its own uploaded plan and
 * its own set of halls stamped onto it.
 */
export function FloorPlanStep({ value, onChange }: FloorPlanStepProps) {
  const [activeKey, setActiveKey] = useState<string>(value[0]?.id ?? '');

  const active = value.find((f) => f.id === activeKey) ?? value[0];

  function patch(id: string, p: Partial<FloorDraft>) {
    onChange(value.map((f) => (f.id === id ? { ...f, ...p } : f)));
  }
  function addFloor() {
    const level = value.length + 1;
    const f: FloorDraft = { id: newFloorId(), name: `Floor ${level}`, level, halls: [] };
    onChange([...value, f]);
    setActiveKey(f.id);
  }
  function removeFloor(id: string) {
    if (value.length <= 1) return;
    const next = value.filter((f) => f.id !== id).map((f, i) => ({ ...f, level: i + 1 }));
    onChange(next);
    if (activeKey === id) setActiveKey(next[0].id);
  }
  function onEdit(targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') {
    if (action === 'add') addFloor();
    else if (typeof targetKey === 'string') removeFloor(targetKey);
  }

  return (
    <Tabs
      type="editable-card"
      activeKey={active?.id}
      onChange={setActiveKey}
      onEdit={onEdit}
      hideAdd={false}
      items={value.map((f) => ({
        key: f.id,
        label: f.name,
        closable: value.length > 1,
        children: active && (
          <div>
            <Space wrap style={{ marginBottom: "var(--vw-space-md)" }}>
              <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Floor name</Text>
              <Input placeholder="Enter floor name"
                size="small"
                value={active.name}
                onChange={(e) => patch(active.id, { name: e.target.value })}
                style={{ width: 200 }}
              />
              <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>· Level {active.level}</Text>
            </Space>
            <FloorPlanCanvas
              value={active.halls}
              onChange={(halls: HallDraft[]) => patch(active.id, { halls })}
              image={active.planImage ?? null}
              onImageChange={(img) => patch(active.id, { planImage: img ?? undefined })}
            />
          </div>
        ),
      }))}
    />
  );
}

export default FloorPlanStep;
