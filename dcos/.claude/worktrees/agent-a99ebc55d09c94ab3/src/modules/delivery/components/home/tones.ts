/* Status chip tones for programmes and projects (chips are used for status only). */
import type { VwChipVariant } from '../../../../shared/components/ux';

export const RAG_TONE: Record<string, VwChipVariant> = { Red: 'error', Amber: 'warning', Green: 'success', Grey: 'neutral' };
export const PROJECT_STATUS_TONE: Record<string, VwChipVariant> = { Planning: 'neutral', Active: 'info', 'At Risk': 'warning', Blocked: 'error', Completed: 'success', 'On Hold': 'neutral' };
export const PROGRAM_STATUS_TONE: Record<string, VwChipVariant> = { Proposed: 'neutral', Planning: 'neutral', Active: 'info', 'On Hold': 'warning', Closed: 'success' };
export const STAGE_TONE: Record<string, VwChipVariant> = { Plan: 'neutral', Procure: 'neutral', Build: 'info', Commission: 'cyan', Live: 'success' };
export const tone = (m: Record<string, VwChipVariant>, k?: string): VwChipVariant => (k && m[k]) || 'neutral';
