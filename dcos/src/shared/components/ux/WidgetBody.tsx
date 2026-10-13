import type { CSSProperties, ReactNode } from 'react';
import { Tooltip } from 'antd';
import './widget-body.css';

/** Bounded dashboard lists scroll without stretching neighbouring widgets. */
export function WidgetBody({ label, children, height = 320, fill = false, className = '' }: {
  label: string; children: ReactNode; height?: number; fill?: boolean; className?: string;
}) {
  return <div className={`widget-body${fill ? ' widget-body--fill' : ''} ${className}`}
    style={{ '--widget-height': `${height}px` } as CSSProperties}
    role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

/** The full label remains available to pointer and keyboard users. */
export function WidgetLabel({ children, className = '' }: { children: string; className?: string }) {
  return <Tooltip title={children} trigger={['hover', 'focus']} placement="topLeft">
    <span className={`widget-label ${className}`} tabIndex={0}>{children}</span>
  </Tooltip>;
}
