import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gauge, Inbox, TrendingUp, Zap } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Chip, Empty, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { Meter } from '../../../ops/ui/status';
import { SoftMeter, Split, StatGrid, StatTile, type Tone } from '../../../ops/ui/Analytics';
import { TimeChart } from '../../../ops/charts/TimeChart';
import { Sparkline } from '../../../ops/charts/Sparkline';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { perfSummary, estateThroughput, utilColor, UTIL_WARN, UTIL_CRIT, type IfStat } from '../lib/metrics';
import type { Interface, ManagedDevice } from '../../../mock/data/types';

const BUCKET_TONE: Tone[] = ['success', 'info', 'orange', 'error'];
type TalkerRow = IfStat & { id: string; rank: number };

export default function PerformancePage() {
  const navigate = useNavigate();
  const ifaces = (useEntityList('interfaces', { pageSize: 10000 }).data?.data ?? []) as unknown as Interface[];
  const devices = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];

  const m = useMemo(() => {
    const s = perfSummary(ifaces);
    const throughput = estateThroughput(ifaces);
    const peak = Math.max(0, ...throughput.map((p) => p.value));
    return { s, throughput, peak };
  }, [ifaces]);

  const devName = useMemo(() => Object.fromEntries(devices.map((d) => [d.id, d.hostname])), [devices]);
  const totalUp = m.s.up || 1;

  const labels = m.throughput.filter((p) => p.series === 'Ingress').map((p) => p.t);
  const series = [
    { key: 'in', label: 'Ingress', color: 'var(--primaryColor500)', kind: 'line' as const, values: m.throughput.filter((p) => p.series === 'Ingress').map((p) => p.value) },
    { key: 'out', label: 'Egress', color: 'var(--vw-color-cyan-500)', kind: 'line' as const, values: m.throughput.filter((p) => p.series === 'Egress').map((p) => p.value) },
  ];
  const bucketParts = m.s.buckets.map((b, i) => ({ key: b.band, label: b.band, n: b.n, tone: BUCKET_TONE[i] ?? 'neutral' }));
  const talkers: TalkerRow[] = m.s.top.map((st, i) => ({ ...st, id: st.iface.id, rank: i + 1 }));

  const cols: Col<TalkerRow>[] = [
    { key: 'rank', header: '#', align: 'right', sort: (r) => r.rank, render: (r) => <span className="num vw-label">{r.rank}</span> },
    { key: 'iface', header: 'Interface', sort: (r) => devName[r.iface.deviceId] ?? '', render: (r) => (
      <span className="cell-2"><span className="vw-card-activity-label">{devName[r.iface.deviceId] ?? 'device'} · {r.iface.name}</span><small>{r.iface.speedGbps}G · {r.iface.inErrors + r.iface.outErrors} errors</small></span>
    ) },
    { key: 'trend', header: 'Trend', render: (r) => <span style={{ display: 'inline-block', width: 96 }}><Sparkline values={r.series.map((p) => p.util)} color={utilColor(r.p95)} height={26} /></span> },
    { key: 'cur', header: 'Now', sort: (r) => r.cur, render: (r) => <Meter pct={r.cur} width={64} color={utilColor(r.cur)} /> },
    { key: 'p95', header: 'P95', align: 'right', sort: (r) => r.p95, render: (r) => <span className="num">{r.p95}%</span> },
    { key: 'st', header: 'Status', sort: (r) => (r.breach ? 1 : 0), render: (r) => r.breach ? <Chip tone="error" dot>breach</Chip> : <Chip tone="success" dot>ok</Chip> },
  ];

  return (
    <OpsPage title="Performance" description="Estate utilisation, throughput and the interfaces running hottest">

      <StatGrid>
        <StatTile label="Mean utilisation" value={<>{m.s.meanUtil}<small>%</small></>} sub="interfaces that are up">
          <SoftMeter pct={m.s.meanUtil} tone={m.s.meanUtil >= UTIL_WARN ? 'orange' : 'info'} />
        </StatTile>
        <StatTile label="P95 utilisation" value={<>{m.s.p95Util}<small>%</small></>} sub={`warn ${UTIL_WARN}% · critical ${UTIL_CRIT}%`}>
          <SoftMeter pct={m.s.p95Util} tone={m.s.p95Util >= UTIL_CRIT ? 'error' : m.s.p95Util >= UTIL_WARN ? 'orange' : 'purple'} />
        </StatTile>
        <StatTile label="Throughput now" value={<>{m.s.throughputGbps}<small> Gbps</small></>} sub={`peak ${m.peak} Gbps · 24h`} />
        <StatTile label="Breaching ifaces" value={m.s.breaching} sub={m.s.breaching ? 'above sustained threshold' : 'none breaching'} subTone={m.s.breaching ? 'warn' : undefined} />
        <StatTile label="Interfaces up" value={m.s.up} sub={`of ${m.s.up + m.s.down} interfaces`}>
          <Split parts={[{ key: 'up', label: 'Up', n: m.s.up, tone: 'success' }, { key: 'down', label: 'Down', n: m.s.down, tone: 'error' }]} legend={false} />
        </StatTile>
        <StatTile label="Interfaces down" value={m.s.down} sub={m.s.down ? 'operationally down' : 'all up'} subTone={m.s.down ? 'bad' : undefined} />
      </StatGrid>

      <div className="grid g-2-1">
        <Panel title="Estate throughput" sub={`Last 24h · peak ${m.peak} Gbps`} icon={Zap}>
          {labels.length
            ? <TimeChart labels={labels} series={series} height={264} yMin={0} format={(v) => `${v}G`} />
            : <Empty icon={Inbox} title="No interface data" />}
        </Panel>
        <Panel title="Utilisation distribution" sub={`${totalUp} interfaces up`} icon={Gauge}>
          <div className="col" style={{ gap: 14 }}>
            <Split parts={bucketParts} />
            <span className="vw-label">Breach thresholds — warn {UTIL_WARN}%, critical {UTIL_CRIT}% (sustained p95).</span>
          </div>
        </Panel>
      </div>

      <Panel title="Top talkers" sub="Highest sustained utilisation · click to open the device" icon={TrendingUp} count={talkers.length} flush>
        <DataTable rows={talkers} cols={cols} onRow={(r) => navigate(`/nms/devices/${r.iface.deviceId}`)} defaultSort={{ key: 'rank', dir: 'asc' }} pageSize={10}
          empty={<Empty icon={Inbox} title="No interface data" />} />
      </Panel>
    </OpsPage>
  );
}
