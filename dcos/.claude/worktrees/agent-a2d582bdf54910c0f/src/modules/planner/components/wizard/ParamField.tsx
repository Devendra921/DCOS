/* Editable plan parameter: control by type, the source chip, and a reset to the template default. */
import type { ReactNode } from 'react';
import { Input, InputNumber, Select, Switch, Tooltip } from 'antd';
import { VwButton as Button } from '../../../../shared/components/vw/VwButton';
import { RollbackOutlined } from '../../../../shared/icons';
import type * as T from '../../../../mock/data/types';
import type { Evaluation, ParamValue } from '../../lib/engine';
import { SourceChip } from '../kit';
import { COOLING_LABEL } from './wizardModel';

export interface ParamFieldProps {
  def: T.PlannerParamDef;
  ev?: Evaluation;
  draft: T.PlannerPlan;
  setParam: (key: string, value: ParamValue, source?: T.PlannerParamSource) => void;
  resetParam: (key: string) => void;
  /** Compact single-line layout for tables and rails. */
  compact?: boolean;
}

const optionLabel = (key: string, o: string) => (key === 'coolingType' ? COOLING_LABEL[o as T.PlannerCoolingType] ?? o : key === 'feedVoltage' ? `${Number(o).toLocaleString('en-US')} V` : key === 'uplinkGbps' ? `${o} Gbps` : key === 'commissioningLevel' ? `Level ${o}` : o);

export function ParamField({ def, ev, draft, setParam, resetParam, compact }: ParamFieldProps) {
  const cur = ev?.params[def.key];
  const value = cur?.value ?? def.default;
  const overridden = draft.params[def.key] !== undefined;
  const control: ReactNode = def.type === 'bool'
    ? <Switch size="small" checked={Boolean(value)} onChange={v => setParam(def.key, v)} />
    : def.type === 'select'
      ? <Select size="small" style={{ width: compact ? 150 : '100%' }} value={value === undefined ? undefined : String(value)} options={(def.options ?? []).map(o => ({ value: o, label: optionLabel(def.key, o) }))} onChange={v => setParam(def.key, v)} />
      : def.type === 'number'
        ? <InputNumber size="small" style={{ width: compact ? 120 : '100%' }} value={typeof value === 'number' ? value : Number(value) || undefined} min={def.min} max={def.max} step={[def.default, def.min, def.max].every(v => v === undefined || Number.isInteger(v)) ? 1 : def.max !== undefined && def.max <= 3 ? 0.01 : 0.1} addonAfter={def.unit} onChange={v => { if (typeof v === 'number') setParam(def.key, v); }} />
        : <Input size="small" style={{ width: compact ? 160 : '100%' }} value={String(value ?? '')} onChange={e => setParam(def.key, e.target.value)} />;
  const reset = overridden ? <Tooltip title="Back to the template default"><Button size="small" type="text" icon={<RollbackOutlined />} onClick={() => resetParam(def.key)} aria-label={`Reset ${def.label}`} /></Tooltip> : null;
  if (compact) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{control}{cur && <SourceChip source={cur.source} note={cur.note} />}{reset}</div>;
  }
  return (
    <div className="vw-card-child" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, minHeight: 24 }}>
        <Tooltip title={def.help ?? def.derived}><span style={{ fontSize: 12, fontWeight: 500, color: 'var(--vw-color-slate-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def.label}</span></Tooltip>
        {reset}
      </div>
      {control}
      {cur && <span><SourceChip source={cur.source} note={cur.note} /></span>}
    </div>
  );
}

/** Grid of parameter fields for a list of keys, skipping keys the template does not define. */
export function ParamGrid({ keys, defs, cols = 3, ...rest }: { keys: string[]; defs: Map<string, T.PlannerParamDef>; cols?: number } & Omit<ParamFieldProps, 'def'>) {
  const list = keys.map(k => defs.get(k)).filter((d): d is T.PlannerParamDef => !!d);
  if (!list.length) return null;
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8 }}>{list.map(d => <ParamField key={d.key} def={d} {...rest} />)}</div>;
}

export function Field({ label, children, hint, style }: { label: ReactNode; children: ReactNode; hint?: ReactNode; style?: React.CSSProperties }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...style }}><span style={{ fontSize: 12, fontWeight: 500, color: 'var(--vw-color-slate-700)' }}>{label}</span>{children}{hint && <span style={{ fontSize: 11, color: 'var(--vw-color-slate-500)' }}>{hint}</span>}</label>;
}

export function StepTitle({ title, description, extra }: { title: string; description: string; extra?: ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}><div><div className="vw-card-title-lg">{title}</div><div className="vw-card-description">{description}</div></div>{extra}</div>;
}

export function SubTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, margin: '12px 0 8px' }}><div className="vw-card-title-sm">{children}</div>{extra}</div>;
}
