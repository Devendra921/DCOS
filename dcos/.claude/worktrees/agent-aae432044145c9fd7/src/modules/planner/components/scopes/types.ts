/* UI pieces each family of plan types contributes. Anything not given falls back to the generic UI. */
import type { ReactNode } from 'react';
import type * as T from '../../../../mock/data/types';
import type { DimensionKey } from '../../lib/dimensions';
import type { Evaluation } from '../../lib/engine';
import type { PlannerData } from '../../lib/plannerData';
import type { StepProps } from '../wizard/wizardModel';

export interface PlanViewProps { plan: T.PlannerPlan; ev: Evaluation; data: PlannerData; template?: T.PlannerTemplate; benchmarks: T.PlannerBenchmark[] }
export interface ScopeUi {
  /** Result panel per dimension step (replaces the generic panel for that dimension). */
  panels?: Partial<Record<DimensionKey, (p: StepProps) => ReactNode>>;
  /** Replaces the generic site picker on the Requirements step. */
  sitePicker?: (p: StepProps) => ReactNode;
  /** Extra blocks on the Requirements step, under the site. */
  requirements?: (p: StepProps) => ReactNode;
  /** Extra sections in the plan pack (after the generic ones). */
  packSections?: { key: string; label: string; count?: (p: PlanViewProps) => string; render: (p: PlanViewProps) => ReactNode }[];
  /** Extra tabs on the plan page (after Overview and Plan pack). */
  detailTabs?: { key: string; label: string; badge?: (p: PlanViewProps) => number | string | undefined; render: (p: PlanViewProps) => ReactNode }[];
}
