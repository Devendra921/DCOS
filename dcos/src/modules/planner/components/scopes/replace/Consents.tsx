/* Consent register: who must agree, how much notice they get, and where each one stands. Used by
   rack replacements (tenants) and migrations (customers). */
import { Input, InputNumber, Select } from 'antd';
import { VwChip } from '../../../../../shared/components/ux';
import type * as T from '../../../../../mock/data/types';

const STATUS: T.PlannerConsent['status'][] = ['Not sent', 'Notified', 'Consented', 'Refused'];
const TONE = { 'Not sent': 'neutral', Notified: 'warning', Consented: 'success', Refused: 'error' } as const;
const day = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const fromDay = (v: string) => (v ? new Date(`${v}T09:00:00Z`).toISOString() : undefined);

export function ConsentRegister({ rows, onChange, firstWave, readOnly }: { rows: T.PlannerConsent[]; onChange?: (rows: T.PlannerConsent[]) => void; firstWave?: (c: T.PlannerConsent) => string | undefined; readOnly?: boolean }) {
  const set = (i: number, p: Partial<T.PlannerConsent>) => onChange?.(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  if (!rows.length) return <div className="vw-card-description">Nobody to ask: no tenant or customer service is affected.</div>;
  return (
    <div className="nst-table-wrap"><table className="nst-table" style={{ width: '100%' }}>
      <thead><tr><th>Who</th><th>Account manager</th><th style={{ textAlign: 'right' }}>Services</th><th style={{ textAlign: 'right' }}>Notice (days)</th><th>Status</th><th>Notified</th><th>Agreed</th><th>First wave</th><th>Notice ends</th></tr></thead>
      <tbody>{rows.map((r, i) => {
        const fw = firstWave?.(r); const ends = r.notifiedAt ? new Date(new Date(r.notifiedAt).getTime() + r.noticeDays * 864e5).toISOString() : undefined;
        const short = !!fw && (!ends || ends > fw);
        return (
          <tr key={r.customerRef}>
            <td><b>{r.customerName}</b></td><td>{r.accountManager ?? '—'}</td><td style={{ textAlign: 'right' }}>{r.serviceIds.length}</td>
            <td style={{ textAlign: 'right' }}>{readOnly ? r.noticeDays : <InputNumber size="small" min={0} max={365} value={r.noticeDays} onChange={v => typeof v === 'number' && set(i, { noticeDays: v })} style={{ width: 70 }} />}</td>
            <td>{readOnly ? <VwChip variant={TONE[r.status]}>{r.status}</VwChip> : <Select size="small" value={r.status} style={{ width: 120 }} options={STATUS.map(s => ({ value: s, label: s }))} onChange={v => set(i, { status: v, notifiedAt: v !== 'Not sent' && !r.notifiedAt ? new Date().toISOString() : r.notifiedAt, consentAt: v === 'Consented' && !r.consentAt ? new Date().toISOString() : r.consentAt })} />}</td>
            <td>{readOnly ? day(r.notifiedAt) || '—' : <Input size="small" type="date" value={day(r.notifiedAt)} onChange={e => set(i, { notifiedAt: fromDay(e.target.value) })} style={{ width: 140 }} />}</td>
            <td>{readOnly ? day(r.consentAt) || '—' : <Input size="small" type="date" value={day(r.consentAt)} onChange={e => set(i, { consentAt: fromDay(e.target.value) })} style={{ width: 140 }} />}</td>
            <td>{fw ? day(fw) : '—'}</td>
            <td style={{ color: short ? 'var(--vw-color-red-600)' : undefined }}>{ends ? day(ends) : 'not notified'}{short && ' (after the wave)'}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}
