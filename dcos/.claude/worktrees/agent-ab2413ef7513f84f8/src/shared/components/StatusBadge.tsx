import React from 'react';
import { Badge } from 'antd';
import { VwChip } from './ux/VwChip';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleFilled,
  SyncOutlined,
  ToolFilled,
  EditFilled,
  ExclamationCircleFilled,
  PauseCircleFilled,
  FileTextFilled,
  StopFilled,
  WarningFilled,
  MinusCircleFilled,
} from '../icons';
import { RAG_COLORS, STATUS_PALETTE, TECHNOLOGY_COLORS } from '../../core/theme/themeConfig';
import type { StatusPalette } from '../../core/theme/themeConfig';

// Map module-specific status labels to a canonical key in STATUS_PALETTE so
// every consumer (sites, scopes, designs, permits, issues) renders the same
// pastel-fill / dark-text pill from a single source of truth.
const STATUS_TO_PALETTE_KEY: Record<string, keyof typeof STATUS_PALETTE> = {
  Nominal: 'Draft',
  Candidate: 'In Progress',
  Acquired: 'In Progress',
  Design: 'In Progress',
  Approved: 'Active',
  Build: 'In Progress',
  Integration: 'In Progress',
  'On-Air': 'On-Air',
  Accepted: 'Accepted',
  Closed: 'Cancelled',
  Cancelled: 'Cancelled',
  'On-Hold': 'On-Hold',
  Open: 'Blocked',
  'In Progress': 'In Progress',
  'Under Review': 'Under Review',
  Resolved: 'Completed',
  'Not Started': 'Not Started',
  Completed: 'Completed',
  Delayed: 'Delayed',
  Blocked: 'Blocked',
  Submitted: 'In Progress',
  Draft: 'Draft',
  Pending: 'Pending',
  Active: 'Active',
  'At Risk': 'At Risk',
  Expired: 'Expired',
  Expiring: 'Expiring Soon',
  'Expiring Soon': 'Expiring Soon',
  Terminated: 'Terminated',
  Inactive: 'Cancelled',
};

const NEUTRAL_PALETTE: StatusPalette = { bg: '#f3f4f6', fg: '#4b5563' };

const paletteFor = (status: string): StatusPalette => {
  const key = STATUS_TO_PALETTE_KEY[status];
  if (key && STATUS_PALETTE[key]) return STATUS_PALETTE[key];
  if (STATUS_PALETTE[status]) return STATUS_PALETTE[status];
  return NEUTRAL_PALETTE;
};

/**
 * Exported alias of `paletteFor`. Consumers that need to render their
 * own bespoke status indicators (inline coloured dot, colour-coded text,
 * vertical accent bar) can reach the canonical palette without having
 * to wrap the full `<StatusTag>` / `<StatusDot>` shells.
 */
export const statusPaletteFor = paletteFor;

// ── Status → AntD Tag color + icon map ──────────────────────────
// Maps every lifecycle stage to AntD's canonical Tag colour token
// (success / processing / error / warning / default) and a matching
// icon. AntD's `<Tag color="success">` renders the universally
// recognised "status tag" — soft tinted background, matching border,
// matching darker text. The processing variant animates the icon for
// "in flight" stages — same pattern AntD's own examples use.
type TagPreset = {
  color: string;
  icon: React.ReactNode;
};

const STATUS_TAG: Record<string, TagPreset> = {
  'On-Air':       { color: 'success',    icon: <CheckCircleFilled /> },
  Active:         { color: 'success',    icon: <CheckCircleFilled /> },
  Completed:      { color: 'success',    icon: <CheckCircleFilled /> },
  Accepted:       { color: 'success',    icon: <CheckCircleFilled /> },
  Approved:       { color: 'success',    icon: <CheckCircleFilled /> },
  Resolved:       { color: 'success',    icon: <CheckCircleFilled /> },

  'In Progress':  { color: 'processing', icon: <SyncOutlined spin /> },
  Integration:    { color: 'processing', icon: <SyncOutlined spin /> },
  Submitted:      { color: 'processing', icon: <SyncOutlined spin /> },
  'Under Review': { color: 'processing', icon: <SyncOutlined spin /> },
  Build:          { color: 'processing', icon: <ToolFilled /> },
  Design:         { color: 'blue',       icon: <EditFilled /> },

  Candidate:      { color: 'default',    icon: <FileTextFilled /> },
  Acquired:       { color: 'default',    icon: <FileTextFilled /> },
  Nominal:        { color: 'default',    icon: <FileTextFilled /> },
  Draft:          { color: 'default',    icon: <FileTextFilled /> },

  Pending:        { color: 'gold',       icon: <ClockCircleFilled /> },
  'Not Started':  { color: 'default',    icon: <ClockCircleFilled /> },
  'On-Hold':      { color: 'gold',       icon: <PauseCircleFilled /> },

  Delayed:        { color: 'error',      icon: <WarningFilled /> },
  'At Risk':      { color: 'warning',    icon: <WarningFilled /> },
  Open:           { color: 'warning',    icon: <ExclamationCircleFilled /> },
  Blocked:        { color: 'error',      icon: <ExclamationCircleFilled /> },
  Expired:        { color: 'error',      icon: <ExclamationCircleFilled /> },
  'Expiring Soon':{ color: 'warning',    icon: <WarningFilled /> },

  Closed:         { color: 'default',    icon: <MinusCircleFilled /> },
  Cancelled:      { color: 'default',    icon: <CloseCircleFilled /> },
  Terminated:     { color: 'default',    icon: <StopFilled /> },
  Inactive:       { color: 'default',    icon: <MinusCircleFilled /> },
};

const tagPresetFor = (status: string): TagPreset => {
  if (STATUS_TAG[status]) return STATUS_TAG[status];
  // Fall back through the canonical key map (e.g. "Resolved" → "Completed")
  const key = STATUS_TO_PALETTE_KEY[status];
  if (key && STATUS_TAG[key]) return STATUS_TAG[key];
  return { color: 'default', icon: <MinusCircleFilled /> };
};

/**
 * Canonical status tag — AntD's native `<Tag color="...">` with a
 * matching icon. This is the universally recognised "status tag"
 * pattern used by Jira / Azure / ServiceNow / Salesforce style
 * dashboards and AntD's own examples:
 *
 *   • soft tinted background in the status' colour family
 *   • matching same-tone border (1 px)
 *   • matching darker text
 *   • leading icon — `processing` variants spin the icon
 *
 * Same `<StatusDot>` export name so callers don't change; under the
 * hood it now delegates to `<Tag>` with the appropriate preset.
 */
export const StatusDot: React.FC<{
  status: string;
  style?: React.CSSProperties;
}> = ({ status, style }) => {
  const preset = tagPresetFor(status);
  return (
    <VwChip
      color={preset.color}
      icon={preset.icon}
      style={{
        margin: 0,
        fontSize: "var(--vw-font-label-sm)",
        fontWeight: 500,
        padding: '1px 8px',
        borderRadius: "var(--vw-radius-xs)",
        ...style,
      }}
    >
      {status}
    </VwChip>
  );
};

/**
 * Soft-pastel status pill. Background + text both come from the canonical
 * STATUS_PALETTE so the same status looks identical across the app.
 */
export const StatusTag: React.FC<{ status: string; style?: React.CSSProperties }> = ({ status, style }) => {
  const p = paletteFor(status);
  return (
    <VwChip
      style={{
        background: p.bg,
        color: p.fg,
        fontWeight: 500,
        padding: '1px 8px',
        borderRadius: 999,
        margin: 0,
        ...style,
      }}
    >
      {status}
    </VwChip>
  );
};

// RAG values are health signals, not colours — show what each actually means.
// Falls back to the raw value if it isn't a known RAG key (green/amber/red/grey).
const RAG_MEANING: Record<string, string> = {
  green: 'On Track',
  amber: 'At Risk',
  red: 'Behind',
  grey: 'Not Started',
};

const ragLabel = (value: string): string => RAG_MEANING[value?.toLowerCase()] ?? value;

export const RAGDot: React.FC<{ value: string; size?: number }> = ({ value, size = 10 }) => {
  const color = RAG_COLORS[value.toLowerCase() as keyof typeof RAG_COLORS] || RAG_COLORS.grey;
  return <Badge color={color} text={ragLabel(value)} />;
};

export const RAGIndicator: React.FC<{ value: string }> = ({ value }) => {
  const color = RAG_COLORS[value.toLowerCase() as keyof typeof RAG_COLORS] || RAG_COLORS.grey;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: '1px solid rgba(0,0,0,0.1)' }} />
      <span>{ragLabel(value)}</span>
    </div>
  );
};

/**
 * Derives a soft tinted background from the technology's full-saturation
 * color without polluting the palette with hand-curated pastel pairs.
 * `color-mix()` (not string-concatenating an alpha channel onto the hex)
 * so this also works if `TECHNOLOGY_COLORS` values are ever tokenized to
 * `var(--vw-color-*)` references — alpha-channel string math silently
 * breaks on those since it only understands literal hex.
 */
const tint = (color: string, pct: number): string => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

export const TechnologyTag: React.FC<{ type: string }> = ({ type }) => {
  const color = TECHNOLOGY_COLORS[type] || '#4b5563';
  return (
    <VwChip
      style={{
        background: tint(color, 12),
        color,
        fontWeight: 500,
        padding: '1px 8px',
        borderRadius: 999,
        margin: 0,
      }}
    >
      {type}
    </VwChip>
  );
};

export const PriorityTag: React.FC<{ priority: string }> = ({ priority }) => {
  const paletteMap: Record<string, StatusPalette> = {
    'P1 - Critical': { bg: '#fee2e2', fg: '#991b1b' },
    'P2 - High':     { bg: '#fef3c7', fg: '#92400e' },
    'P3 - Medium':   { bg: '#dbeafe', fg: '#1e40af' },
    'P4 - Low':      NEUTRAL_PALETTE,
  };
  const p = paletteMap[priority] ?? NEUTRAL_PALETTE;
  return (
    <VwChip
      style={{
        background: p.bg,
        color: p.fg,
        fontWeight: 500,
        padding: '1px 8px',
        borderRadius: 999,
        margin: 0,
      }}
    >
      {priority}
    </VwChip>
  );
};
