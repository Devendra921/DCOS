import { useRef, useState } from 'react';
import { Input, InputNumber, Upload, Empty, Typography, Space } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { UploadOutlined, PlusOutlined, DeleteOutlined, PictureOutlined } from '../../../shared/icons';
import type { HallDraft } from '../lib/commit';
import { VwChip } from '../../../shared/components/ux';

const { Text } = Typography;
const CELL = 13;
let seq = 0;
const newId = () => `h-local-${Date.now().toString(36)}-${seq++}`;

export interface FloorPlanCanvasProps {
  value: HallDraft[];
  onChange: (halls: HallDraft[]) => void;
  image: string | null;
  onImageChange: (img: string | null) => void;
}

/**
 * Trace-on-backdrop layout editor for one floor. Upload that floor's plan, then
 * stamp halls onto it where the rooms sit; drag to position, set each hall's grid.
 */
export function FloorPlanCanvas({ value, onChange, image, onImageChange }: FloorPlanCanvasProps) {
  const img = image;
  const [selId, setSelId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const sel = value.find((h) => h.id === selId) ?? null;

  function readImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => onImageChange(reader.result as string);
    reader.readAsDataURL(file);
  }

  function addHall() {
    const n = value.length;
    const h: HallDraft = {
      id: newId(),
      name: `Hall ${n + 1}`,
      x: 0.12 + (n % 3) * 0.26,
      y: 0.14 + Math.floor(n / 3) * 0.3,
      gridCols: 8,
      gridRows: 4,
    };
    onChange([...value, h]);
    setSelId(h.id);
  }

  function patch(id: string, p: Partial<HallDraft>) {
    onChange(value.map((h) => (h.id === id ? { ...h, ...p } : h)));
  }
  function remove(id: string) {
    onChange(value.filter((h) => h.id !== id));
    if (selId === id) setSelId(null);
  }

  function onHallPointerDown(e: React.PointerEvent, h: HallDraft) {
    e.stopPropagation();
    setSelId(h.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = {
      id: h.id,
      dx: (e.clientX - rect.left) / rect.width - h.x,
      dy: (e.clientY - rect.top) / rect.height - h.y,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onCanvasPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(0.97, Math.max(0, (e.clientX - rect.left) / rect.width - drag.current.dx));
    const y = Math.min(0.95, Math.max(0, (e.clientY - rect.top) / rect.height - drag.current.dy));
    patch(drag.current.id, { x, y });
  }
  function endDrag() { drag.current = null; }

  const totalCap = value.reduce((s, h) => s + h.gridCols * h.gridRows, 0);

  return (
    <div className="vw-floor-plan-editor">
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space style={{ marginBottom: 10 }} wrap>
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={(f) => { readImage(f); return false; }}
          >
            <Button icon={<UploadOutlined />}>{img ? 'Replace floor plan' : 'Upload floor plan'}</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={addHall}>Add hall</Button>
          <VwChip>{value.length} halls · {totalCap} rack positions</VwChip>
        </Space>

        <div
          ref={canvasRef}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onPointerDown={() => setSelId(null)}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 10',
            border: "1px solid var(--vw-color-gray-200)",
            borderRadius: "var(--vw-radius-sm)",
            overflow: 'hidden',
            background: img
              ? `#fff url(${img}) center/contain no-repeat`
              : 'repeating-linear-gradient(45deg,#f8fafc,#f8fafc 12px,#f1f5f9 12px,#f1f5f9 24px)',
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          {!img && (
            <div className="vw-text-tertiary" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <PictureOutlined style={{ fontSize: "var(--vw-font-value-xxl)" }} />
              <Text type="secondary">Upload a building / floor plan, then stamp halls onto it</Text>
            </div>
          )}
          {value.map((h) => {
            const w = h.gridCols * CELL + 10;
            const hgt = h.gridRows * CELL + 22;
            const isSel = h.id === selId;
            return (
              <div
                key={h.id}
                onPointerDown={(e) => onHallPointerDown(e, h)}
                style={{
                  position: 'absolute',
                  left: `${h.x * 100}%`,
                  top: `${h.y * 100}%`,
                  width: w,
                  height: hgt,
                  cursor: 'move',
                  borderRadius: 6,
                  border: `2px solid ${isSel ? 'var(--primaryColor500)' : '#0ea5e9'}`,
                  background: isSel ? 'color-mix(in srgb, var(--primaryColor500) 14%, transparent)' : 'rgba(14,165,233,0.10)',
                  boxShadow: isSel ? '0 0 0 3px color-mix(in srgb, var(--primaryColor500) 18%, transparent)' : undefined,
                  padding: 3,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ fontSize: "var(--vw-font-label-xs)", fontWeight: 600, color: "var(--vw-color-sky-900)", lineHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  {h.name} · {h.gridCols}×{h.gridRows}
                </div>
                <svg width={h.gridCols * CELL} height={h.gridRows * CELL}>
                  {Array.from({ length: h.gridRows }).map((_, ry) =>
                    Array.from({ length: h.gridCols }).map((__, cx) => (
                      <rect key={`${cx}-${ry}`} x={cx * CELL + 1} y={ry * CELL + 1} width={CELL - 2} height={CELL - 2} rx={1.5} fill="#fff" stroke="#7dd3fc" />
                    )),
                  )}
                </svg>
              </div>
            );
          })}
        </div>
        <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>
          Drag halls to match their position on the plan. Each cell becomes a rack position.
        </Text>
      </div>

      <div className="vw-floor-plan-inspector">
        {sel ? (
          <div style={{ border: "1px solid var(--vw-color-gray-200)", borderRadius: "var(--vw-radius-sm)", padding: "var(--vw-space-md)" }}>
            <Text strong>Hall settings</Text>
            <div style={{ marginTop: 10 }}>
              <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Name</Text>
              <Input placeholder="Enter hall name" value={sel.name} onChange={(e) => patch(sel.id, { name: e.target.value })} size="small" />
            </div>
            <Space style={{ marginTop: 10 }}>
              <div>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Columns</Text>
                <InputNumber placeholder="Enter rack columns" min={1} max={20} value={sel.gridCols} onChange={(v) => patch(sel.id, { gridCols: Number(v) || 1 })} size="small" style={{ width: 90 }} />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>Rows</Text>
                <InputNumber placeholder="Enter rack rows" min={1} max={12} value={sel.gridRows} onChange={(v) => patch(sel.id, { gridRows: Number(v) || 1 })} size="small" style={{ width: 90 }} />
              </div>
            </Space>
            <div style={{ marginTop: 10 }}>
              <VwChip color="blue">{sel.gridCols * sel.gridRows} rack positions</VwChip>
            </div>
            <Button danger size="small" icon={<DeleteOutlined />} style={{ marginTop: "var(--vw-space-md)" }} onClick={() => remove(sel.id)} block>
              Remove hall
            </Button>
          </div>
        ) : (
          <div style={{ border: "1px dashed var(--vw-color-gray-200)", borderRadius: "var(--vw-radius-sm)", padding: "var(--vw-space-md)" }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Select a hall to edit" />
          </div>
        )}
      </div>
    </div>
  );
}

export default FloorPlanCanvas;
