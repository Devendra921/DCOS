/* Status chip tones for programmes and projects (chips are used for status only). */
import type { VwChipVariant } from '../../../../shared/components/ux';

export const RAG_TONE: Record<string, VwChipVariant> = { Red: 'error', Amber: 'warning', Green: 'success', Grey: 'neutral' };
export const PROJECT_STATUS_TONE: Record<string, VwChipVariant> = { Planning: 'neutral', Active: 'info', 'At Risk': 'warning', Blocked: 'error', Completed: 'success', 'On Hold': 'neutral' };
export const PROGRAM_STATUS_TONE: Record<string, VwChipVariant> = { Proposed: 'neutral', Planning: 'neutral', Active: 'info', 'On Hold': 'warning', Closed: 'success' };
export const STAGE_TONE: Record<string, VwChipVariant> = { Plan: 'neutral', Procure: 'neutral', Build: 'info', Commission: 'cyan', Live: 'success' };
export const tone = (m: Record<string, VwChipVariant>, k?: string): VwChipVariant => (k && m[k]) || 'neutral';

/* The same tones for the Operate kit's Chip (src/ops/ui/kit), which has no accent or outlined variant. */
export type OpsTone = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'purple' | 'orange' | 'cyan' | 'pink';
export const opsTone = (v?: VwChipVariant): OpsTone => (v === 'accent' ? 'info' : v === 'warning-outlined' ? 'warning' : v ?? 'neutral');
/** antd preset colour names (permit and design status maps) to chip tones. */
const ANTD_TONE: Record<string, OpsTone> = { default: 'neutral', blue: 'info', geekblue: 'info', gold: 'warning', orange: 'orange', green: 'success', red: 'error', volcano: 'orange', cyan: 'cyan', purple: 'purple', magenta: 'pink' };
export const antdTone = (c?: string): OpsTone => (c && ANTD_TONE[c]) || 'neutral';
