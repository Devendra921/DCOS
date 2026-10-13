/**
 * Shared UX primitives — apply uniformly across modules per ui-uxenhancment.md.
 *
 * Import surface:
 *   import { KpiTile, KpiBand, DashboardHeader, AlertBanner, EmptyState, WorkflowStepper, UX } from '@/shared/components/ux';
 */

export * from './uxTokens';
export { KpiTile, KpiBand } from './KpiTile';
export type { KpiTileProps, KpiStatus, KpiDirection } from './KpiTile';
export { DashboardHeader, DEFAULT_PERIODS } from './DashboardHeader';
export type { DashboardHeaderProps, DashboardPeriodOption } from './DashboardHeader';
export {
  useDashboardPeriod, inPeriod, periodToDays, periodLabel, periodSuffix,
} from './periodWindow';
export type { PeriodWindow, PeriodCode } from './periodWindow';
export { AlertBanner } from './AlertBanner';
export type { AlertBannerProps, AlertItem, AlertLevel } from './AlertBanner';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { WorkflowStepper } from './WorkflowStepper';
export type { WorkflowStep, WorkflowStepperProps, StepState } from './WorkflowStepper';
export { Pill } from './Pill';
export type { PillProps, PillStatus } from './Pill';
export { SavedViewsDropdown } from './SavedViewsDropdown';
export type { SavedViewsDropdownProps } from './SavedViewsDropdown';
export { RowActions, rowActionsColumn } from './RowActions';
export type { RowActionsProps, RowActionItem, RowActionDivider, RowActionsInput } from './RowActions';
export { EntityIconCell } from './EntityIconCell';
export type { EntityIconCellProps, EntityIconTone } from './EntityIconCell';
// ─── Modernization v2 (telecom OS 2030) ─────────────────────────────
export * from './uxMotion';
export * from './uxSurfaces';
export { GlassCard } from './GlassCard';
export type { GlassCardProps, GlassCardElevation, GlassCardAccent } from './GlassCard';
export { PulseDot } from './PulseDot';
export type { PulseDotProps, PulseStatus } from './PulseDot';
export { TrendBadge } from './TrendBadge';
export type { TrendBadgeProps, TrendDirection } from './TrendBadge';
export { SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';
export { AIInsightCard } from './AIInsightCard';
export type { AIInsightCardProps } from './AIInsightCard';
export { CommandPalette } from './CommandPalette';
export type { CommandPaletteProps, CommandItem } from './CommandPalette';
export { ChartAutoFitBox } from './ChartAutoFitBox';
export type { ChartAutoFitBoxProps } from './ChartAutoFitBox';
// ─── Iteration 5: detail-page + workflow primitives ─────────────────
export { DetailPageHeader } from './DetailPageHeader';
export type { DetailPageHeaderProps, DetailHeaderAction, DetailHeaderProperty } from './DetailPageHeader';
export { TabBarV2 } from './TabBarV2';
export type { TabBarV2Props, TabV2Item } from './TabBarV2';
export { NextActionButton } from './NextActionButton';
export type { NextActionButtonProps, NextActionTransition } from './NextActionButton';
// ─── Iteration 6: chart motion + login skin ─────────────────────────
export { AnimatedPath, RevealGroup, BarRise, CHART_KEYFRAMES } from './ChartMotion';
export type { AnimatedPathProps, RevealGroupProps, BarRiseProps } from './ChartMotion';
export { LoginShell } from './LoginShell';
export type { LoginShellProps } from './LoginShell';
// ─── vw-card/vw-chip primitives (capacity-forecaster CSS system) ────
export { VwCard } from './VwCard';
export type { VwCardProps, VwCardVariant, VwCardTone } from './VwCard';
export { VwChip } from './VwChip';
export type { VwChipProps, VwChipVariant } from './VwChip';
export { VwSegmented } from './VwSegmented';
export type { VwSegmentedProps, VwSegmentedOption } from './VwSegmented';
