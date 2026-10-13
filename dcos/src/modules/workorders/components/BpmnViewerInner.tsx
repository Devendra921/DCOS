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
  /** The view is framed once per import; after that the user's zoom and pan are kept. */
  const framed = useRef(false);
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
    const ro = new ResizeObserver(() => { if (framed.current) return; try { v.get<Canvas>('canvas').zoom('fit-viewport', 'auto' as never); } catch { /* not imported yet */ } });
    ro.observe(host.current);
    return () => { ro.disconnect(); v.destroy(); viewer.current = null; };
  }, []);

  // import
  useEffect(() => {
    const v = viewer.current;
    if (!v || !xml) return;
    let cancelled = false;
    applied.current = [];
    framed.current = false;
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
    // First view: the whole process when it is readable; otherwise open on the current step at a readable size.
    if (!framed.current) { framed.current = true; frame(v, 'current', markers); }
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

  const act = (what: 'fit' | 'in' | 'out' | 'current') => { const v = viewer.current; if (!v) return; framed.current = true; frame(v, what, markers); };
  const hasCurrent = Object.values(markers ?? {}).some(k => k === 'active' || k === 'incident');
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div ref={host} className="wf-diagram" style={{ height, width: '100%' }} />
      <div className="vw-flex vw-gap-xs" style={{ position: 'absolute', top: 8, right: 8 }} role="toolbar" aria-label="Diagram view">
        {hasCurrent && <button type="button" className="nst-btn nst-btn--xs" onClick={() => act('current')}>Current step</button>}
        <button type="button" className="nst-btn nst-btn--xs" onClick={() => act('fit')}>Whole process</button>
        <button type="button" className="nst-btn nst-btn--xs" aria-label="Zoom out" onClick={() => act('out')}>−</button>
        <button type="button" className="nst-btn nst-btn--xs" aria-label="Zoom in" onClick={() => act('in')}>+</button>
      </div>
      <div style={{ position: 'absolute', bottom: 6, left: 10, fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)', pointerEvents: 'none' }}>Drag to move · scroll to zoom</div>
    </div>
  );
}

/** Below this scale the labels of a fitted diagram are too small to read. */
const READABLE = 0.65;
function frame(v: NavigatedViewer, what: 'fit' | 'in' | 'out' | 'current', markers?: Record<string, MarkerKind>) {
  const canvas = v.get<Canvas>('canvas');
  try {
    if (what === 'in' || what === 'out') { canvas.zoom(Math.min(2, Math.max(0.2, canvas.zoom() * (what === 'in' ? 1.25 : 0.8)))); return; }
    canvas.zoom('fit-viewport', 'auto' as never);
    if (what === 'fit') return;
    const current = Object.entries(markers ?? {}).find(([, k]) => k === 'incident')?.[0] ?? Object.entries(markers ?? {}).find(([, k]) => k === 'active')?.[0];
    const el = current ? v.get<ElementRegistry>('elementRegistry').get(current) as { x: number; y: number; width: number; height: number } | undefined : undefined;
    if (!el || canvas.zoom() >= READABLE) return;
    canvas.zoom(0.9);
    const vb = canvas.viewbox();
    canvas.viewbox({ x: el.x + el.width / 2 - vb.width / 2, y: el.y + el.height / 2 - vb.height / 2, width: vb.width, height: vb.height });
  } catch { /* diagram not imported yet */ }
}
