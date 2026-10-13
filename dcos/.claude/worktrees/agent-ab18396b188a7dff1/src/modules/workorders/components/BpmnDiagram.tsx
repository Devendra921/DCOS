/** Lazy wrapper around the bpmn-js viewer (keeps bpmn-js out of the main bundle). */
import { lazy, Suspense } from 'react';
import type { BpmnDiagramProps } from './BpmnViewerInner';

const Inner = lazy(() => import('./BpmnViewerInner'));

export type { BpmnDiagramProps, WfOverlay } from './BpmnViewerInner';

export function BpmnDiagram(props: BpmnDiagramProps) {
  const height = props.height ?? 420;
  return (
    <Suspense fallback={<div className="vw-skeleton vw-skeleton-block" style={{ height, width: '100%', borderRadius: 'var(--vw-radius-md)' }} />}>
      {props.xml ? <Inner {...props} /> : <div className="vw-skeleton vw-skeleton-block" style={{ height, width: '100%', borderRadius: 'var(--vw-radius-md)' }} />}
    </Suspense>
  );
}

export function DiagramLegend({ heat }: { heat?: boolean }) {
  return (
    <div className="wf-legend">
      <span><i className="wf-legend-swatch wf-legend-swatch--completed" />Completed</span>
      <span><i className="wf-legend-swatch wf-legend-swatch--active" />Active token</span>
      <span><i className="wf-legend-swatch wf-legend-swatch--incident" />Incident</span>
      {heat && <span><i className="wf-legend-swatch wf-legend-swatch--heat" />Heat</span>}
    </div>
  );
}
