/* Small building blocks shared by the change screens, on the Operate kit: status chips, muted text,
   key–value lists (kit KV) and the chain trail. */
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type * as T from '../../../mock/data/types';
import { Chip, KV } from '../../../ops/ui/kit';
import { CLASS_TONE, RISK_TONE, STATUS_LABEL, STATUS_TONE, WO_STATUS_TONE, type ChangeStatus } from '../lib/model';

export const StatusChip = ({ status }: { status: ChangeStatus }) => <Chip tone={STATUS_TONE[status] ?? 'neutral'} dot>{STATUS_LABEL[status] ?? status}</Chip>;
export const ClassChip = ({ cls }: { cls: T.ChangeClass }) => <Chip tone={CLASS_TONE[cls]}>{cls}</Chip>;
export const RiskChip = ({ risk, short }: { risk: string; short?: boolean }) => <Chip tone={RISK_TONE[risk] ?? 'neutral'}>{short ? risk : `${risk} risk`}</Chip>;
export const WoStatusChip = ({ status }: { status: string }) => <Chip tone={WO_STATUS_TONE[status] ?? 'neutral'} dot>{status === 'InProgress' ? 'In progress' : status}</Chip>;

/** Muted helper text. */
export function Muted({ children, size = 'sm' }: { children: ReactNode; size?: 'xs' | 'sm' }) {
  return <span className="vw-label" style={{ fontSize: size === 'xs' ? 12 : 13 }}>{children}</span>;
}

/** Inline callout (the Operate `.note`): info, warning, error or success. */
export function Note({ tone = 'info', children, style }: { tone?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode; style?: CSSProperties }) {
  return <div className={`note note--${tone}`} style={style}><div style={{ minWidth: 0, flex: 1 }}>{children}</div></div>;
}

/** Key–value grid (the kit's KV). */
export function KvList({ items, columns = 1 }: { items: { label: ReactNode; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return <KV cols={columns} items={items.map(it => [it.label, <span key="v" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{it.value}</span>])} />;
}

/** Where a record sits: plan → programme → project → work order → change. Missing links are shown as such. */
export function ChainTrail({ plan, program, project, workOrder, change }: { plan?: T.PlannerPlan; program?: T.Program; project?: T.Project; workOrder?: T.WorkOrder; change?: { id: string } }) {
  const parts: { label: string; value?: string; to?: string }[] = [
    { label: 'Plan', value: plan ? `${plan.plnId} ${plan.title}` : undefined, to: plan ? `/planning/plans/${plan.id}` : undefined },
    { label: 'Programme', value: program ? `${program.progId ?? program.id} ${program.name}` : undefined, to: program ? `/delivery/programs/${program.id}` : undefined },
    { label: 'Project', value: project ? `${project.projId ?? project.id} ${project.name}` : undefined, to: project ? `/delivery/projects/${project.id}` : undefined },
    { label: 'Work order', value: workOrder ? `${workOrder.woId ?? workOrder.id}${workOrder.title ? ` ${workOrder.title}` : ''}` : undefined, to: workOrder ? `/delivery/work-orders/${workOrder.id}` : undefined },
    ...(change ? [{ label: 'Change', value: change.id }] : []),
  ];
  return (
    <nav aria-label="Delivery chain" className="row" style={{ gap: 6, flexWrap: 'wrap', fontSize: 13, minWidth: 0 }}>
      {parts.map((p, i) => (
        <span key={p.label} className="row" style={{ gap: 6, minWidth: 0 }}>
          {i > 0 && <span aria-hidden className="vw-label">›</span>}
          <span className="vw-label">{p.label}</span>
          {p.value
            ? (p.to ? <Link to={p.to} className="ent-link" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.value}>{p.value}</Link> : <span className="strong">{p.value}</span>)
            : <span className="vw-label">none</span>}
        </span>
      ))}
    </nav>
  );
}
