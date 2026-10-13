/**
 * Scope model · server refresh, network device refresh and rack replacement.
 * Hooks not defined here fall back to the generic engine, output, wizard and execution behaviour.
 */
import type { ScopeModel } from './types';

export const replaceModel: ScopeModel = {
  family: 'replace',
};
