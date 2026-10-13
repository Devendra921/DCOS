/**
 * Density adaptation — progressive disclosure per the active perspective.
 * See role-perspective-architecture.md §6.
 *
 *  - comfortable : essentials only — field & external roles, large targets
 *  - standard    : the default working set
 *  - expert      : every column / diagnostic band — power users
 *
 * Tag a column or band with the *minimum* density at which it appears;
 * untagged surfaces always show. Nothing is ever made unreachable — dense
 * detail is collapsed for lighter perspectives, not removed.
 */
import { usePerspective } from './PerspectiveContext';
import type { Density } from './types';

export const DENSITY_RANK: Record<Density, number> = {
  comfortable: 0,
  standard: 1,
  expert: 2,
};

/** True when `active` density is at least `min`. Pure — safe outside React. */
export function densityMeets(active: Density, min: Density): boolean {
  return DENSITY_RANK[active] >= DENSITY_RANK[min];
}

/** Hook — does the active perspective meet at least `min` density? */
export function useDensityAtLeast(min: Density): boolean {
  const { perspective } = usePerspective();
  return densityMeets(perspective.density, min);
}

/** A column (or any object) optionally tagged with a minimum density. */
export type WithDensity<C> = C & { minDensity?: Density };

/**
 * Filter a tagged column list against the active perspective's density.
 * Columns with no `minDensity` always show; a column tagged `expert` shows
 * only for an expert-density perspective, etc.
 *
 *   const cols: WithDensity<ColumnType<Row>>[] = [
 *     { title: 'Site', dataIndex: 'name' },
 *     { title: 'Raw RSRP', dataIndex: 'rsrp', minDensity: 'expert' },
 *   ];
 *   <Table columns={useDensityColumns(cols)} ... />
 */
export function useDensityColumns<C>(columns: WithDensity<C>[]): WithDensity<C>[] {
  const { perspective } = usePerspective();
  const active = DENSITY_RANK[perspective.density];
  return columns.filter((c) => !c.minDensity || DENSITY_RANK[c.minDensity] <= active);
}
