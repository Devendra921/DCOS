import { useMemo } from 'react';
import { Activity, TriangleAlert } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Meter } from '../../../ops/ui/status';
import { SoftMeter, StatGrid, StatTile } from '../../../ops/ui/Analytics';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { DataContract } from '../components/PreviewScaffold';
import { pseudo } from '../components/previewViz';
import type { ManagedDevice, UPS, CRAC } from '../../../mock/data/types';

interface RiskRow {
  id: string; name: string; type: string; risk: number; window: number; action: string;
}

export default function PredictivePreview() {
  const devices = (useEntityList('managedDevices', { pageSize: 400 }).data?.data ?? []) as unknown as ManagedDevice[];
  const ups = (useEntityList('upsUnits', { pageSize: 200 }).data?.data ?? []) as unknown as UPS[];
  const cracs = (useEntityList('cracUnits', { pageSize: 200 }).data?.data ?? []) as unknown as CRAC[];

  const rows = useMemo<RiskRow[]>(() => {
    const ACTIONS = ['Schedule PSU replacement', 'Inspect cooling fan', 'Battery health check', 'Firmware update + reseat', 'Replace before EOL window'];
    const pool: { id: string; name: string; type: string }[] = [
      ...devices.slice(0, 40).map((d) => ({ id: d.id, name: d.hostname ?? d.id, type: d.deviceType ?? 'Device' })),
      ...ups.map((u) => ({ id: u.id, name: u.name, type: 'UPS' })),
      ...cracs.map((c) => ({ id: c.id, name: c.name, type: 'Cooling' })),
    ];
    return pool
      .map((p, i) => {
        const risk = Math.round(20 + pseudo(i, 3) * 79);
        return { ...p, risk, window: 3 + Math.round(pseudo(i, 7) * 45), action: ACTIONS[i % ACTIONS.length] };
      })
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 12);
  }, [devices, ups, cracs]);

  const atRisk = rows.filter((r) => r.risk >= 70).length;
  const failures30 = rows.filter((r) => r.risk >= 70 && r.window <= 30).length;

  const anomalies = [
    { c: rows[0]?.name ?? 'ups-1', metric: 'Battery runtime', obs: '6.2 min', base: '14 min', sev: 'Major' },
    { c: rows[1]?.name ?? 'crac-12', metric: 'Return-air temp', obs: '34°C', base: '27°C', sev: 'Major' },
    { c: rows[2]?.name ?? 'tor-a3x', metric: 'CRC error rate', obs: '4.1%', base: '0.2%', sev: 'Minor' },
    { c: rows[3]?.name ?? 'pdu-7', metric: 'Phase imbalance', obs: '18%', base: '<5%', sev: 'Minor' },
  ];

  const riskColor = (r: number) => (r >= 85 ? 'var(--vw-color-red-500)' : r >= 70 ? 'var(--vw-color-amber-500)' : 'var(--vw-color-emerald-500)');

  const cols: Col<RiskRow>[] = [
    { key: 'name', header: 'Component', sort: (r) => r.name, render: (r) => <span className="cell-2"><span className="vw-card-activity-label mono">{r.name}</span><small>{r.action}</small></span> },
    { key: 'type', header: 'Type', sort: (r) => r.type, render: (r) => <Chip tone="neutral" size="xs">{r.type}</Chip> },
    { key: 'risk', header: 'Risk', sort: (r) => r.risk, render: (r) => <Meter pct={r.risk} width={72} color={riskColor(r.risk)} label={String(r.risk)} /> },
    { key: 'window', header: 'Predicted window', align: 'right', sort: (r) => r.window, render: (r) => <span className="num">~{r.window} days</span> },
  ];

  return (
    <OpsPage title="Predictive Failure & Anomaly Detection" description="Model-driven risk scoring, predicted failure windows, and anomaly flags for power, cooling, and network assets.">
      <StatGrid cols={4}>
        <StatTile label="Components at risk" value={atRisk} sub="risk score ≥ 70" subTone={atRisk ? 'warn' : undefined} />
        <StatTile label="Predicted failures (30d)" value={failures30} sub="at risk within 30 days" subTone={failures30 ? 'bad' : undefined} />
        <StatTile label="Open anomalies" value={anomalies.length} sub="deviating from baseline" />
        <StatTile label="Model confidence" value={<>87<small>%</small></>} sub="risk model">
          <SoftMeter pct={87} tone="success" />
        </StatTile>
      </StatGrid>

      <div className="grid g-2-1" style={{ alignItems: 'start' }}>
        <Panel title="Top at-risk components" sub="Recommended action under each component" icon={TriangleAlert} count={rows.length} flush>
          <DataTable rows={rows} cols={cols} maxHeight={320} pageSize={50} compact />
        </Panel>
        <Panel title="Anomaly feed" icon={Activity} count={anomalies.length}>
          <div className="col">
            {anomalies.map((a) => (
              <div key={`${a.c}-${a.metric}`} className={`alert-row ${a.sev === 'Major' ? 'sev-major' : 'sev-minor'}`}>
                <div className="col grow" style={{ gap: 2 }}>
                  <div className="row between"><b className="mono">{a.c}</b><Chip tone={a.sev === 'Major' ? 'error' : 'orange'} size="xs">{a.sev}</Chip></div>
                  <small>{a.metric}: <b style={{ display: 'inline', color: 'var(--vw-color-red-600)' }}>{a.obs}</b> vs baseline {a.base}</small>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <DataContract
        sources={['Time-series telemetry store', 'Asset registry + lifecycle', 'Maintenance/incident history']}
        cadence="Scoring hourly; anomaly stream near-real-time"
        fields={[
          { name: 'metricHistory[]', desc: '≥90 days of per-asset telemetry (temp, load, errors, runtime)' },
          { name: 'assetAge / eolDate', desc: 'lifecycle features for the risk model' },
          { name: 'failureLabels[]', desc: 'historical failures/RMAs to train + validate the model' },
          { name: 'baselineProfile', desc: 'learned normal range per metric for anomaly deviation' },
        ]}
        notes={[
          'Risk score + predicted window must be produced by a server-side model; UI only renders score, window, confidence, and the contributing features.',
          'Every flag should link to the evidence (which metric, how far from baseline) so an engineer can trust it.',
        ]}
      />
    </OpsPage>
  );
}
