/**
 * PerspectiveSwitcher — single-profile mode.
 *
 * The platform now ships a single Admin perspective with full access, so
 * the original tier/switcher dropdown is gone. We still export the same
 * component name so all the headers that render `<PerspectiveSwitcher />`
 * keep compiling — it just renders a static "Admin · Full access" pill.
 */
import React from 'react';
import { usePerspective } from './PerspectiveContext';

export const PerspectiveSwitcher: React.FC = () => {
  const { perspective } = usePerspective();

  return (
    <div
      aria-label="Active profile"
      title="Single-profile mode — every capability granted"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: "var(--vw-space-sm)",
        padding: '5px 12px',
        background: "var(--vw-color-slate-50)",
        border: `1px solid ${perspective.accent}55`,
        borderRadius: "var(--vw-radius-sm)",
        cursor: 'default',
        fontSize: 13,
        lineHeight: 'normal',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 3, background: perspective.accent }} />
      <span style={{ fontWeight: 600, color: "var(--vw-color-slate-900)" }}>{perspective.shortLabel}</span>
      <span style={{ color: "var(--vw-color-slate-500)", fontSize: "var(--vw-font-label-xs)" }}>· Full access</span>
    </div>
  );
};
