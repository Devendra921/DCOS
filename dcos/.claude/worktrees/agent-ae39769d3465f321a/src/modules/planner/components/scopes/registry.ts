/* UI registry: the family UI for each plan type. */
import type * as T from '../../../../mock/data/types';
import { FAMILY_OF, type ScopeFamily } from '../../lib/scopes/types';
import type { ScopeUi } from './types';
import { inSiteUi } from './inSite';
import { plantUi } from './plant';
import { networkUi } from './network';
import { buildUi } from './build';
import { replaceUi } from './replace';
import { migrationUi } from './migration';

const UI: Record<ScopeFamily, ScopeUi> = { 'in-site': inSiteUi, plant: plantUi, network: networkUi, build: buildUi, replace: replaceUi, migration: migrationUi };
export const uiFor = (scope: T.PlannerScope): ScopeUi => UI[FAMILY_OF[scope]];
