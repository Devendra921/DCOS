/** bpmn-js NavigatedViewer wrapper — loaded lazily by BpmnDiagram. */
import { useEffect, useRef, useState } from 'react';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Overlays from 'diagram-js/lib/features/overlays/Overlays';
import type EventBus from 'diagram-js/lib/core/EventBus';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import '../workorders.css';
import type { MarkerKind } from '../lib/useWorkflows';

export interface WfOverlay { elementId: string; html: string; position?: { top?: number; left?: number; bottom?: number; right?: number } }
export interface BpmnDiagramProps {
  xml?: string;
  height?: number;
  markers?: Record<string, MarkerKind>;
  /** Numeric intensity per element (instance counts, waiting hours …) — rendered as a fill class + badge. */
  heat?: Record<string, number>;
  heatLabel?: (elementId: string, value: number) => string;
  overlays?: WfOverlay[];
  selectedId?: string;
  onSelect?: (elementId: string) => void;
}

const MARKER_CLASS: Record<MarkerKind, string> = { completed: 'wf-completed', active: 'wf-active', incident: 'wf-incident', taken: 'wf-taken' };

export default function BpmnViewerInner({ xml, height = 420, markers, heat, heatLabel, overlays, selectedId, onSelect }: BpmnDiagramProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<NavigatedViewer | null>(null);
  const applied = useRef<[string, string][]>([]);
  const [imported, setImported] = useState(0);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // create / destroy
  useEffect(() => {
    if (!host.current) return;
    const v = new NavigatedViewer({ container: host.current });
    viewer.current = v;
    v.get<EventBus>('eventBus').on('element.click', (e: { element: { id: string; type: string } }) => {
      if (e.element && !/Participant|Lane|Process|Collaboration/.test(e.element.type)) onSelectRef.current?.(e.element.id);
    });
    const ro = new ResizeObserver(() => { try { v.get<Canvas>('canvas').zoom('fit-viewport', 'auto' as never); } catch { /* not imported yet */ } });
    ro.observe(host.current);
    return () => { ro.disconnect(); v.destroy(); viewer.current = null; };
  }, []);

  // import
  useEffect(() => {
    const v = viewer.current;
    if (!v || !xml) return;
    let cancelled = false;
    applied.current = [];
    v.importXML(xml).then(() => {
      if (cancelled) return;
      v.get<Canvas>('canvas').zoom('fit-viewport', 'auto' as never);
      setImported((n) => n + 1);
    }).catch((err: unknown) => console.warn('[workorders] BPMN import failed', err));
    return () => { cancelled = true; };
  }, [xml]);

  // markers, heat, overlays
  useEffect(() => {
    const v = viewer.current;
    if (!v || !imported) return;
    const canvas = v.get<Canvas>('canvas');
    const registry = v.get<ElementRegistry>('elementRegistry');
    const ov = v.get<Overlays>('overlays');
    for (const [id, cls] of applied.current) { if (registry.get(id)) canvas.removeMarker(id, cls); }
    applied.current = [];
    ov.clear();
    const mark = (id: string, cls: string) => { if (!registry.get(id)) return; canvas.addMarker(id, cls); applied.current.push([id, cls]); };
    for (const [id, kind] of Object.entries(markers ?? {})) mark(id, MARKER_CLASS[kind]);
    if (selectedId) mark(selectedId, 'wf-selected');
    const values = Object.values(heat ?? {}).filter((n) => n > 0);
    const max = Math.max(0, ...values);
    for (const [id, n] of Object.entries(heat ?? {})) {
      if (n <= 0 || !registry.get(id)) continue;
      const level = max <= 0 ? 1 : Math.max(1, Math.ceil((n / max) * 4));
      mark(id, `wf-heat-${level}`);
      ov.add(id, 'wf-heat', { position: { top: -10, right: -10 }, html: `<div class="wf-heat-badge">${heatLabel ? heatLabel(id, n) : n}</div>` });
    }
    for (const o of overlays ?? []) {
      if (!registry.get(o.elementId)) continue;
      ov.add(o.elementId, 'wf-info', { position: o.position ?? { bottom: -6, left: 0 }, html: o.html });
    }
  }, [imported, markers, heat, heatLabel, overlays, selectedId]);

  return <div ref={host} className="wf-diagram" style={{ height, width: '100%' }} />;
}
