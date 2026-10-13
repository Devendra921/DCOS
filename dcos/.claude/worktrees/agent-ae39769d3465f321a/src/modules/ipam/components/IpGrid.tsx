import { Tooltip } from 'antd';
import type { IPAddress } from '../../../mock/data/types';

const C: Record<string, string> = { Allocated: '#2563eb', Reserved: '#f59e0b', Conflict: 'var(--vw-color-red-600)', Available: '#cbd5e1' };

/** Compact IP-allocation grid — one cell per address, colored by status. */
export function IpGrid({ ips, max = 256 }: { ips: IPAddress[]; max?: number }) {
  if (!ips.length) return <span className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)" }}>No addresses allocated in this subnet yet.</span>;
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {ips.slice(0, max).map((ip) => (
          <Tooltip key={ip.id} title={`${ip.address} · ${ip.status}${ip.hostname ? ' · ' + ip.hostname : ''}`}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: C[ip.status] ?? '#cbd5e1' }} />
          </Tooltip>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: "var(--vw-space-sm)", fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-slate-500)", flexWrap: 'wrap' }}>
        {Object.entries(C).map(([k, v]) => (
          <span key={k}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: v, marginRight: "var(--vw-space-xxs)" }} />{k}</span>
        ))}
      </div>
    </div>
  );
}
export default IpGrid;
