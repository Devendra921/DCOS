/** dmn-js read-only decision-table viewer — loaded lazily by DmnTable. */
import { useEffect, useRef, useState } from 'react';
import DmnNavigatedViewer from 'dmn-js/lib/NavigatedViewer';
import 'dmn-js/dist/assets/diagram-js.css';
import 'dmn-js/dist/assets/dmn-js-shared.css';
import 'dmn-js/dist/assets/dmn-js-drd.css';
import 'dmn-js/dist/assets/dmn-js-decision-table.css';
import 'dmn-js/dist/assets/dmn-js-literal-expression.css';
import 'dmn-js/dist/assets/dmn-font/css/dmn.css';
import '../workorders.css';

export interface DmnTableProps { xml?: string; height?: number; highlightRuleIds?: string[] }

export default function DmnTableInner({ xml, height = 360, highlightRuleIds }: DmnTableProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<DmnNavigatedViewer | null>(null);
  const [opened, setOpened] = useState(0);

  useEffect(() => {
    if (!host.current) return;
    const v = new DmnNavigatedViewer({ container: host.current });
    viewer.current = v;
    return () => { v.destroy(); viewer.current = null; };
  }, []);

  useEffect(() => {
    const v = viewer.current;
    if (!v || !xml) return;
    let cancelled = false;
    v.importXML(xml).then(async () => {
      if (cancelled) return;
      const table = v.getViews().find((view) => view.type === 'decisionTable');
      if (table && v.getActiveView()?.type !== 'decisionTable') await v.open(table);
      if (!cancelled) setOpened((n) => n + 1);
    }).catch((err: unknown) => console.warn('[workorders] DMN import failed', err));
    return () => { cancelled = true; };
  }, [xml]);

  useEffect(() => {
    const root = host.current;
    if (!root || !opened) return;
    const apply = () => {
      root.querySelectorAll('.wf-rule-hit').forEach((el) => el.classList.remove('wf-rule-hit'));
      for (const id of highlightRuleIds ?? []) root.querySelectorAll(`[data-row-id="${id}"]`).forEach((el) => el.classList.add('wf-rule-hit'));
    };
    apply();
    const t = window.setTimeout(apply, 50); // the table renders asynchronously after open()
    return () => window.clearTimeout(t);
  }, [opened, highlightRuleIds]);

  return <div ref={host} className="wf-dmn" style={{ minHeight: height, width: '100%' }} />;
}
