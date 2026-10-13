import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Typography, Empty } from 'antd';
import { ThunderboltOutlined, RiseOutlined, ArrowRightOutlined, DashboardOutlined, WarningOutlined, CheckCircleOutlined, DisconnectOutlined } from '../../../shared/icons';
import { Line } from '@ant-design/charts';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { KPICard } from '../../../shared/components/KPICard';
import { VwCard, VwChip, ChartAutoFitBox } from '../../../shared/components/ux';
import { perfSummary, estateThroughput, utilColor, UTIL_WARN, UTIL_CRIT, type MetricPoint } from '../lib/metrics';
import type { Interface, ManagedDevice } from '../../../mock/data/types';

const { Text } = Typography;

// Compact inline trend — used in the top-talkers rows.
function Sparkline({ data, color, w = 96, h = 26 }: { data: MetricPoint[]; color: string; w?: number; h?: number }) {
  if (data.length < 2) return null;
  const vals = data.map((d) => d.util);
  const min = Math.min(...vals), max = Math.max(...vals, min + 1);
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => h - 2 - ((v - min) / (max - min)) * (h - 4);
  const path = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${path} L${w},${h} L0,${h} Z`;
  // Sanitized to a bare alphanumeric id — `color` is often a `var(--...)` CSS
  // custom property, and its parentheses would prematurely close the
  // `url(#sg-...)` reference wrapping it, breaking the gradient fill (SVG
  // falls back to its default black fill when the paint reference fails).
  const id = `sg-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.22} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
      <path d={area} fill={`url(#${id})`} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

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

  return (
    <div>
      <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>Performance</div>

      {/* ── Pulse ── */}
      <div className="vw-card-title" style={{ margin: 'var(--vw-space-2xl) 0 var(--vw-space-md)' }}>Estate performance</div>
      <div className="vw-grid vw-grid-cols-3 vw-gap-md">
        <KPICard title="Mean utilisation" value={m.s.meanUtil} suffix="%" color={utilColor(m.s.meanUtil)} icon={<DashboardOutlined />} iconTone="cyan" />
        <KPICard title="P95 utilisation" value={m.s.p95Util} suffix="%" color={utilColor(m.s.p95Util)} icon={<RiseOutlined />} iconTone="purple" />
        <KPICard title="Throughput now" value={m.s.throughputGbps} suffix=" Gbps" icon={<ThunderboltOutlined />} iconTone="info" />
        <KPICard title="Breaching ifaces" value={m.s.breaching} color={m.s.breaching ? 'var(--vw-color-orange-700)' : undefined} icon={<WarningOutlined />} iconTone="warning" />
        <KPICard title="Interfaces up" value={m.s.up} color="var(--vw-color-green-600)" icon={<CheckCircleOutlined />} iconTone="success" />
        <KPICard title="Interfaces down" value={m.s.down} color={m.s.down ? 'var(--vw-color-red-600)' : undefined} icon={<DisconnectOutlined />} iconTone="error" />
      </div>

      {/* ── Trend + distribution ── */}
      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Throughput &amp; load</div>
      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} lg={16}>
          <VwCard size="small" style={{ height: '100%' }} title={<><ThunderboltOutlined /> Estate throughput — last 24h</>}
            extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>peak {m.peak} Gbps</Text>}>
            <ChartAutoFitBox height={264}>
              {m.throughput.length ? (
                <Line data={m.throughput} xField="t" yField="value" colorField="series" shapeField="smooth" autoFit
                  scale={{ color: { domain: ['Ingress', 'Egress'], range: ['#000000', '#38bdf8'] } }}
                  axis={{ x: { labelFontSize: 9, labelAutoHide: true, labelAutoRotate: false }, y: { labelFormatter: (v: number) => `${v}G` } }}
                  legend={{ color: { position: 'top' } }} style={{ lineWidth: 2 }} />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No interface data" />}
            </ChartAutoFitBox>
          </VwCard>
        </Col>
        <Col xs={24} lg={8}>
          <VwCard size="small" style={{ height: '100%' }} title={<><RiseOutlined /> Utilisation distribution</>}
            extra={<Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{totalUp} up</Text>}>
            <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: "var(--vw-color-slate-100)", marginTop: 6 }}>
              {m.s.buckets.map((b) => b.n > 0 && <div key={b.band} style={{ width: `${(b.n / totalUp) * 100}%`, background: b.color }} title={`${b.band}: ${b.n}`} />)}
            </div>
            <div style={{ marginTop: "var(--vw-space-lg)", display: 'flex', flexDirection: 'column', gap: "var(--vw-space-md)" }}>
              {m.s.buckets.map((b) => (
                <div key={b.band} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: b.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: "var(--vw-font-label-md)", color: '#515151' }}>{b.band}</span>
                  <span style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 600, color: '#252525', fontVariantNumeric: 'tabular-nums' }}>{b.n}</span>
                </div>
              ))}
            </div>
            <div className="vw-text-tertiary" style={{ marginTop: 14, paddingTop: "var(--vw-space-md)", borderTop: "1px solid var(--vw-color-slate-100)", fontSize: "var(--vw-font-label-sm)" }}>
              Breach thresholds — warn {UTIL_WARN}%, critical {UTIL_CRIT}% (sustained p95).
            </div>
          </VwCard>
        </Col>
      </Row>

      {/* ── Top talkers ── */}
      <div className="vw-card-title" style={{ margin: '28px 0 var(--vw-space-md)' }}>Top talkers · highest sustained utilisation</div>
      <VwCard size="small" bodyStyle={{ padding: '6px 4px' }}>
        {m.s.top.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No interface data" /> : (
          <div>
            {m.s.top.map((st, i) => (
              <div key={st.iface.id}
                onClick={() => navigate(`/nms/devices/${st.iface.deviceId}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 14px', cursor: 'pointer', borderTop: i ? '1px solid #f4f4f4' : 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ width: 18, fontSize: "var(--vw-font-label-sm)", color: '#a8a8a8', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#252525', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {devName[st.iface.deviceId] ?? 'device'} <span className="vw-text-tertiary" style={{ fontWeight: 400 }}>· {st.iface.name}</span>
                  </div>
                  <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{st.iface.speedGbps}G · {st.iface.inErrors + st.iface.outErrors} errors</div>
                </div>
                <Sparkline data={st.series} color={utilColor(st.p95)} />
                <div style={{ width: 64, textAlign: 'right' }}>
                  <div style={{ fontSize: "var(--vw-font-heading-md)", fontWeight: 600, color: utilColor(st.cur), fontVariantNumeric: 'tabular-nums' }}>{st.cur}%</div>
                  <div style={{ fontSize: "var(--vw-font-label-xs)", color: '#a8a8a8' }}>now</div>
                </div>
                <div style={{ width: 70, textAlign: 'right' }}>
                  <div style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 600, color: '#515151', fontVariantNumeric: 'tabular-nums' }}>{st.p95}%</div>
                  <div style={{ fontSize: "var(--vw-font-label-xs)", color: '#a8a8a8' }}>p95</div>
                </div>
                {st.breach
                  ? <VwChip color="error" style={{ marginInlineEnd: 0 }}>breach</VwChip>
                  : <VwChip color="success" style={{ marginInlineEnd: 0 }}>ok</VwChip>}
                <ArrowRightOutlined style={{ color: "var(--vw-color-slate-300)", fontSize: "var(--vw-font-label-sm)" }} />
              </div>
            ))}
          </div>
        )}
      </VwCard>
    </div>
  );
}
