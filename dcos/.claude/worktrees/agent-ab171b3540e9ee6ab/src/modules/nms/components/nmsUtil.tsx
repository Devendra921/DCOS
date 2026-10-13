import { VwChip } from '../../../shared/components/ux';
export const SEV_COLOR: Record<string, string> = { Critical: 'red', Major: 'orange', Minor: 'gold', Warning: 'blue', Info: 'default' };
export const sevTag = (s: string) => <VwChip color={SEV_COLOR[s]}>{s}</VwChip>;
export const REACH_COLOR: Record<string, string> = { Reachable: 'var(--vw-color-green-600)', Degraded: '#f59e0b', Unreachable: 'var(--vw-color-red-600)' };
export const sevToIncident = (s: string): string => (s === 'Critical' ? 'SEV1' : s === 'Major' ? 'SEV2' : 'SEV3');
