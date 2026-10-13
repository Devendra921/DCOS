import { useState } from 'react';
import { Tabs, Input, Space, Typography, Grid } from 'antd';
import { ApartmentOutlined } from '../../../shared/icons';
import { FloorPlanStep } from './FloorPlanStep';
import type { BuildingDraft, FloorDraft } from '../lib/commit';

const { Text } = Typography;
let bseq = 0;
const newBuildingId = () => `b-local-${Date.now().toString(36)}-${bseq++}`;
const newFloorLocalId = () => `f-local-${Date.now().toString(36)}-${bseq++}`;

export interface BuildingStepProps {
  value: BuildingDraft[];
  onChange: (buildings: BuildingDraft[]) => void;
}

/**
 * Data center → Buildings → Floors → Halls. Buildings are the outer tabs; each
 * building holds its own floors (inner tabs), each floor its own plan + halls.
 */
export function BuildingStep({ value, onChange }: BuildingStepProps) {
  const screens = Grid.useBreakpoint();
  const [activeKey, setActiveKey] = useState<string>(value[0]?.id ?? '');
  const active = value.find((b) => b.id === activeKey) ?? value[0];

  function patch(id: string, p: Partial<BuildingDraft>) {
    onChange(value.map((b) => (b.id === id ? { ...b, ...p } : b)));
  }
  function addBuilding() {
    const letter = String.fromCharCode(65 + value.length);
    const b: BuildingDraft = {
      id: newBuildingId(),
      name: `Building ${letter}`,
      floors: [{ id: newFloorLocalId(), name: 'Floor 1', level: 1, halls: [] }],
    };
    onChange([...value, b]);
    setActiveKey(b.id);
  }
  function removeBuilding(id: string) {
    if (value.length <= 1) return;
    const next = value.filter((b) => b.id !== id);
    onChange(next);
    if (activeKey === id) setActiveKey(next[0].id);
  }
  function onEdit(targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') {
    if (action === 'add') addBuilding();
    else if (typeof targetKey === 'string') removeBuilding(targetKey);
  }

  return (
    <Tabs
      type="editable-card"
      tabPosition={screens.md ? 'left' : 'top'}
      activeKey={active?.id}
      onChange={setActiveKey}
      onEdit={onEdit}
      addIcon={<span><ApartmentOutlined /> Building</span>}
      items={value.map((b) => ({
        key: b.id,
        label: b.name,
        closable: value.length > 1,
        children: active && (
          <div>
            <Space wrap style={{ marginBottom: "var(--vw-space-md)" }}>
              <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Building name</Text>
              <Input placeholder="Enter building name"
                size="small"
                value={active.name}
                onChange={(e) => patch(active.id, { name: e.target.value })}
                style={{ width: 220 }}
              />
            </Space>
            <FloorPlanStep
              value={active.floors}
              onChange={(floors: FloorDraft[]) => patch(active.id, { floors })}
            />
          </div>
        ),
      }))}
    />
  );
}

export default BuildingStep;
