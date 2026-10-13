/**
 * Navigation adaptation — reshapes the sidebar menu per perspective.
 * See role-perspective-architecture.md §5.
 *
 *  - restricted : drop every group/leaf outside the perspective's primary
 *                 modules — externals & field roles see ~6 items, not 251.
 *  - focused    : primary-module groups stay at top; the rest collapse into
 *                 a single "More" group (reachable, never cluttering).
 *  - full       : whole menu, primary-module groups reordered to the top.
 *
 * No route is removed — deep links still resolve. Only *presentation* changes.
 */
import { AppstoreOutlined } from '../../shared/icons';
import type { MenuItem } from '../layout/menuConfig';
import type { Perspective } from './types';

const moduleCodesIn = (item: MenuItem): string[] => {
  const codes: string[] = [];
  const walk = (n: MenuItem) => {
    if (n.moduleCode) codes.push(n.moduleCode);
    (n.children ?? []).forEach(walk);
  };
  walk(item);
  return codes;
};

export function adaptMenu(items: MenuItem[], p: Perspective): MenuItem[] {
  const home = items.find((i) => i.key === 'dashboard');
  const groups = items.filter((i) => i.key !== 'dashboard');

  // A module is "primary" if its own moduleCode OR any descendant leaf's
  // moduleCode is primary — robust to menuConfig entries that carry the code
  // only on leaves (e.g. the Sites group).
  const isPrimaryModule = (m: MenuItem) =>
    moduleCodesIn(m).some((c) => p.primaryModuleCodes.includes(c));
  const groupHasPrimary = (g: MenuItem) =>
    moduleCodesIn(g).some((c) => p.primaryModuleCodes.includes(c));

  // ── restricted — externals / field: only the in-scope modules ──────
  if (p.navScope === 'restricted') {
    const kept = groups
      .map((g) => ({ ...g, children: (g.children ?? []).filter(isPrimaryModule) }))
      .filter((g) => g.children.length > 0);
    return [home, ...kept].filter(Boolean) as MenuItem[];
  }

  // ── focused — primary groups up top, the rest under "More" ─────────
  if (p.navScope === 'focused') {
    const primary = groups.filter(groupHasPrimary);
    const rest = groups.filter((g) => !groupHasPrimary(g));
    const more: MenuItem[] = rest.length
      ? [{ key: 'more-modules', label: 'More Network Modules', icon: AppstoreOutlined, children: rest }]
      : [];
    return [home, ...primary, ...more].filter(Boolean) as MenuItem[];
  }

  // ── full — everything, primary groups first ────────────────────────
  const ordered = [...groups].sort(
    (a, b) => Number(groupHasPrimary(b)) - Number(groupHasPrimary(a)),
  );
  return [home, ...ordered].filter(Boolean) as MenuItem[];
}
