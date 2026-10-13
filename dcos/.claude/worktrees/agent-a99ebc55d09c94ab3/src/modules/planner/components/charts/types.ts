import type { LadderRow, Estimate, Sizing, ScheduleItem, Finding, AspectScore, Evaluation, BuildingPlan } from '../../lib/engine';
import type { PlannerScenario } from '../../../../mock/data/types';

export interface PhaseLadderChartProps { rows: LadderRow[]; growthPctPerYear: number; height?: number }
export interface CostBreakdownChartProps { estimate: Estimate; mode?: 'capex' | 'opex'; height?: number }
export interface ScenarioCompareChartProps {
  items: { scenario: PlannerScenario; ev: Evaluation }[]; metric?: 'capex' | 'opex' | 'pue' | 'payback' | 'racks' | 'fails'; height?: number;
  /** Fired when the user clicks a metric row in the strip to refocus the big chart. */
  onMetricChange?: (metric: 'capex' | 'opex' | 'pue' | 'payback' | 'racks' | 'fails') => void;
}
export interface HallLayoutPreviewProps { sizing: Sizing; densityKwPerRack: number; liquid: boolean; height?: number; onPickHall?: (index: number) => void }
export interface PlantOneLineProps { sizing: Sizing; redundancy: string; height?: number }
export interface LeadTimeGanttProps { items: ScheduleItem[]; goLive: string; height?: number }
export interface RuleGaugeProps { findings: Finding[]; size?: number }
export interface AspectRadarProps { aspects: AspectScore[]; size?: number }
export interface BuildingStackProps { building: BuildingPlan; halls: number; buildings: number; height?: number }
