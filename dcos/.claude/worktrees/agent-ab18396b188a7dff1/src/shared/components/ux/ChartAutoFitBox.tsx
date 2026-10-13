import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface ChartAutoFitBoxProps {
  /** Fixed pixel height for the chart area — @ant-design/charts' `autoFit` still needs an explicit height from its container. */
  height: number;
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * Wraps an @ant-design/charts `autoFit` chart (Pie/Line/Column) in a box that
 * force-remounts the chart once this box's own measured width has settled.
 *
 * Why: `autoFit`'s built-in resize handling measures the container at mount
 * and is meant to re-measure via ResizeObserver after that — but in this app
 * the chart's container width frequently keeps changing for a beat *after*
 * the chart's first paint (the app shell's sidebar collapses responsively on
 * load, and antd's responsive `Col` breakpoints resolve on their own tick).
 * The chart can get stuck rendering at whatever transient width it saw
 * first — sometimes falling back to G2's hardcoded default canvas size,
 * sometimes freezing at a too-small intermediate width — instead of the
 * final, settled one. Remounting the chart (via `key`) once width stops
 * changing sidesteps that unreliable internal re-measurement rather than
 * fighting it.
 */
export function ChartAutoFitBox({ height, children, style }: ChartAutoFitBoxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      // Ignore sub-pixel/rounding noise so this doesn't remount on every
      // observer tick — only when the width has actually moved.
      setWidth((prev) => (Math.abs(prev - w) > 2 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ height, width: '100%', ...style }}>
      {width > 0 && <div key={width} style={{ height: '100%', width: '100%' }}>{children}</div>}
    </div>
  );
}

export default ChartAutoFitBox;
