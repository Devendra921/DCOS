/**
 * Scope model · plant upgrade: UPS, generators, transformers, chillers and cooling added to a live site.
 * Hooks not defined here fall back to the generic engine, output, wizard and execution behaviour.
 */
import type { ScopeModel } from './types';

export const plantModel: ScopeModel = {
  family: 'plant',
};
