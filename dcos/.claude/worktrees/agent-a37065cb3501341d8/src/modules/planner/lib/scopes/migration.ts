/**
 * Scope model · migration, consolidation and decommission of a site.
 * Hooks not defined here fall back to the generic engine, output, wizard and execution behaviour.
 */
import type { ScopeModel } from './types';

export const migrationModel: ScopeModel = {
  family: 'migration',
};
