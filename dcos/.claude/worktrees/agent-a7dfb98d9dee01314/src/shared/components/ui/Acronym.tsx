import React from 'react';
import { Tooltip } from 'antd';
import { InfoCircleOutlined } from '../../icons';
import { lookupAcronym } from './ranAcronyms';

interface AcronymProps {
  /** Short form as it should appear inline (e.g. "PCI", "MoU"). */
  short: string;
  /**
   * Full expansion shown in the tooltip. If omitted, looked up in the
   * shared RAN_ACRONYMS dictionary. If still not found, the info icon is
   * suppressed so we don't show a useless empty tooltip.
   */
  expansion?: string;
  /** Optional CSS class applied to the wrapping <span>. */
  className?: string;
  /** Style override on the wrapping <span> (font weight, color, etc.). */
  style?: React.CSSProperties;
  /** Tooltip placement — defaults to "top" to match other domain tooltips. */
  placement?: 'top' | 'bottom' | 'right' | 'left';
}

/**
 * Inline short-form label paired with a small outlined info icon. Hovering
 * the icon (or the whole label) reveals the expansion. Designed for
 * dashboards and tables where domain acronyms (PCI, RAG, EIRP…) should be
 * self-documenting without forcing the full term into the visible layout.
 *
 * If neither an `expansion` prop nor a dictionary entry is found, the
 * component renders just the short form with no icon — fail-quietly behavior
 * so adding the wrapper to existing strings is risk-free.
 */
export const Acronym: React.FC<AcronymProps> = ({
  short,
  expansion,
  className,
  style,
  placement = 'top',
}) => {
  const resolved = expansion ?? lookupAcronym(short);

  if (!resolved) {
    return <span className={className} style={style}>{short}</span>;
  }

  return (
    <Tooltip title={`${short} — ${resolved}`} placement={placement} mouseEnterDelay={0.15}>
      <span
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: "var(--vw-space-xxs)",
          cursor: 'help',
          ...style,
        }}
      >
        {short}
        <InfoCircleOutlined
          aria-label={resolved}
          className="vw-text-tertiary"
          style={{
            fontSize: "var(--vw-font-label-xs)",
            // Subtle gap above the baseline so the icon doesn't hug the
            // descenders of the acronym text.
            marginTop: 1,
          }}
        />
      </span>
    </Tooltip>
  );
};

export default Acronym;
