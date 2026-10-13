import { useMemo } from 'react';
import { Check, Loader, ScrollText, ScanSearch, X, type LucideIcon } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { SoftMeter, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { DataContract } from '../components/PreviewScaffold';
import { pseudo } from '../components/previewViz';
import type { ManagedDevice, DiscoveryJob } from '../../../mock/data/types';

interface ReconRow { id: string; hostname: string; ip: string; type: string; source: string; status: string }
const RECON_TONE: Record<string, Tone> = { Matched: 'success', Drift: 'error', 'New / unplanned': 'orange' };
const JOB: Record<string, { tone: Tone; icon: LucideIcon }> = { Completed: { tone: 'success', icon: Check }, Failed: { tone: 'error', icon: X } };

export default function DiscoveryPreview() {
  const devices = (useEntityList('managedDevices', { pageSize: 400 }).data?.data ?? []) as unknown as ManagedDevice[];
  const jobs = (useEntityList('discoveryJobs', { pageSize: 50 }).data?.data ?? []) as unknown as DiscoveryJob[];

  const recon = useMemo<ReconRow[]>(() => {
    return devices.slice(0, 40).map((d, i) => {
      const roll = pseudo(i, 11);
      const status = roll > 0.82 ? 'New / unplanned' : roll > 0.66 ? 'Drift' : 'Matched';
      return {
        id: d.id,
        hostname: d.hostname ?? d.id,
        ip: d.mgmtIp ?? '—',
        type: d.deviceType ?? 'Device',
        source: d.sourceSystem ?? 'scanner',
        status,
      };
    });
  }, [devices]);

  const found = recon.length;
  const unplanned = recon.filter((r) => r.status === 'New / unplanned').length;
  const drift = recon.filter((r) => r.status === 'Drift').length;
  const reconciledPct = found ? Math.round(((found - unplanned - drift) / found) * 100) : 0;

  const cols: Col<ReconRow>[] = [
    { key: 'host', header: 'Hostname', sort: (r) => r.hostname, render: (r) => <span className="cell-2"><span className="vw-card-activity-label mono">{r.hostname}</span><small className="mono">{r.ip}</small></span> },
    { key: 'type', header: 'Type', sort: (r) => r.type, render: (r) => <Chip tone="neutral" size="xs">{r.type}</Chip> },
    { key: 'source', header: 'Source', sort: (r) => r.source, render: (r) => r.source },
    { key: 'status', header: 'Reconciliation', sort: (r) => r.status, render: (r) => <Chip tone={RECON_TONE[r.status] ?? 'neutral'} dot>{r.status}</Chip> },
  ];

  return (
    <OpsPage title="Network Discovery & Ingestion" description="Automated discovery runs, discovered-vs-planned reconciliation against the source of truth, and an ingestion log.">
      <StatGrid cols={4}>
        <StatTile label="Devices discovered" value={found} sub="in the latest runs" />
        <StatTile label="New / unplanned" value={unplanned} sub="not in the source of truth" subTone={unplanned ? 'warn' : undefined} />
        <StatTile label="Config / SoT drift" value={drift} sub="differs from the planned record" subTone={drift ? 'bad' : undefined} />
        <StatTile label="Reconciled" value={<>{reconciledPct}<small>%</small></>} sub="matched to a planned record">
          <SoftMeter pct={reconciledPct} tone="success" />
        </StatTile>
      </StatGrid>

      <div className="grid g-2-1" style={{ alignItems: 'start' }}>
        <Panel title="Discovered vs planned — reconciliation" sub={`Showing ${recon.length} devices`} icon={ScanSearch} count={recon.length} flush>
          <DataTable rows={recon} cols={cols} maxHeight={320} pageSize={500} compact />
        </Panel>
        <Panel title="Ingestion log" icon={ScrollText} count={Math.min(jobs.length, 6)}>
          {jobs.length === 0 ? <Empty icon={ScrollText} title="No runs yet." /> : (
            <ul className="tl">
              {jobs.slice(0, 6).map((j) => {
                const st = JOB[j.status] ?? { tone: 'info' as Tone, icon: Loader };
                return (
                  <li key={j.id}>
                    <span className={`tl-ico tone-${st.tone}`}><st.icon size={14} /></span>
                    <span className="tl-body">
                      <b>{j.name}</b>
                      <small>{j.method} · {j.scope}</small>
                      <small>{j.devicesFound} devices · {j.linksFound} links · {j.status}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <DataContract
        sources={['SNMP / LLDP', 'Redfish (BMC)', 'DHCP leases', 'ARP scan', 'vendor controllers (UniFi, etc.)']}
        cadence="Scheduled (e.g. hourly/nightly) + on-demand"
        fields={[
          { name: 'discoveredDevice{}', desc: 'hostname, mgmtIp, mac, serial, vendor, model, neighbors' },
          { name: 'matchKey (mac/serial)', desc: 'stable key to reconcile against the SoT record' },
          { name: 'runMeta', desc: 'job id, scope, method, started/completed, counts' },
          { name: 'dedupRules', desc: 'collapse duplicate sightings across scanners' },
        ]}
        notes={[
          'Reconciliation engine compares discovered vs planned and classifies Matched / New / Drift; UI renders the diff + an accept/ignore action.',
          'Ingestion must be idempotent and dedup by MAC/serial so repeat runs don’t create duplicates.',
        ]}
      />
    </OpsPage>
  );
}
