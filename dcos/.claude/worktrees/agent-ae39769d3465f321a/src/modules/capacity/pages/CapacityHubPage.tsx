import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Progress, Typography, Space } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { ThunderboltOutlined, CloudServerOutlined, FireOutlined, ApartmentOutlined, ArrowRightOutlined, DatabaseOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useDcFilter } from '../../../core/scope/DcScope';
import { KPICard } from '../../../shared/components/KPICard';
import { StateBar, STATE_COLORS } from '../components/StateBar';
import CapacityForecastPage from './CapacityForecastPage';
import { useCapacity } from '../lib/useCapacity';
import { useScreenSynopsis } from '../../../core/docs/SynopsisContext';
import type { SynopsisDoc } from '../../../core/docs/types';
import type { Rack, CapacityReservation } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';

const { Text } = Typography;

// Co-located Synopsis — this screen owns its own help content (the scalable,
// per-screen pattern). A stable module-level const so it isn't re-registered.
const SYNOPSIS_DOC: SynopsisDoc = {
  title: 'Capacity Overview',
  summary: 'The single read on whether you can say yes to the next deployment — across power, cooling, space and compute.',
  blocks: [
    { tone: 'tint', title: 'The decision this supports', body: 'Power, cooling, space and compute are the hard limits of a data center. This screen turns live device placement into one answer: how much room is genuinely left before you have to build more — and which dimension runs out first.' },
    { tone: 'plain', title: 'What the headline numbers mean', bullets: ['Power Headroom / Cooling Headroom — kW left before the safe maximum', 'Net Available (− reservations & pipeline) — headroom after subtracting capacity already promised; turns red below zero', 'GPU Utilization — accelerator capacity in use, the gate for AI placement', 'Reserved (backlog) — holds waiting to be committed'] },
    { tone: 'plain', title: 'The four gauges', body: 'Space, Power, Cooling and Compute each show utilisation on a dial — green below 60%, amber 60–85%, red at or above 85%. Click any gauge to drill into that dimension’s detail.' },
    { tone: 'tint', title: 'The reservation ledger', body: 'Capacity flows Available → Reserved → Committed → Consumed. Reserved and Committed are netted out of “Net Available”, so the headroom you see is what you can actually still commit — not just what is physically unused.' },
    { tone: 'plain', title: 'What you can do', body: '“Raise capacity plan” starts a Capacity Expansion plan in Planning, pre-filled from current draw — it routes for approval and becomes a delivery project. The AI-density signals show how many racks are ≥30 kW, liquid-cooling ready, and have GPU slots free.' },
    { tone: 'tint', title: 'Watch for', body: 'A healthy dimension can mask a blocked one. If power, cooling or compute is comfortable but deployments still won’t fit, the binding constraint is one of the others — capacity is only real when all four agree.' },
  ],
};

export default function CapacityHubPage() {
  useScreenSynopsis(SYNOPSIS_DOC);
  const navigate = useNavigate();
  const dcF = useDcFilter();
  const cap = useCapacity();
  const racks = (useEntityList('racks', { pageSize: 10000, filters: dcF }).data?.data ?? []) as unknown as Rack[];
  const rsv = (useEntityList('capacityReservations', { pageSize: 500 }).data?.data ?? []) as unknown as CapacityReservation[];

  const extra = useMemo(() => ({
    highDensity: racks.filter((r) => r.maxPowerKw >= 30).length,
    liquidReady: racks.filter((r) => r.liquidCoolingReady).length,
    rsvSeg: ['Available', 'Reserved', 'Committed', 'Consumed'].map((s) => ({ label: s, value: rsv.filter((x) => x.state === s).length, color: STATE_COLORS[s] })),
    reservedBacklog: rsv.filter((x) => x.state === 'Reserved').length,
  }), [racks, rsv]);

  const gauge = (title: string, percent: number, icon: React.ReactNode, foot: string, to: string, danger?: boolean) => (
    <VwCard size="small" hoverable onClick={() => navigate(to)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>{icon} {title}</Text>
        <ArrowRightOutlined style={{ color: "var(--vw-color-slate-300)" }} />
      </div>
      <div style={{ textAlign: 'center', margin: '8px 0' }}>
        <Progress type="dashboard" percent={percent} size={120} strokeColor={danger && percent >= 85 ? 'var(--vw-color-red-600)' : percent >= 60 ? '#f59e0b' : 'var(--vw-color-green-600)'} />
      </div>
      <div style={{ textAlign: 'center', fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)" }}>{foot}</div>
    </VwCard>
  );

  return (
    <div>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <div>
          <div className="vw-page-title" role="heading" aria-level={3}>Capacity</div>
        </div>
        <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => navigate(`/planning/new?intent=${encodeURIComponent(`Plan a site expansion adding ${Math.round(cap.power.used * 0.2)} kW of IT capacity`)}`)}>Raise capacity plan</Button>
      </div>

      <div className="vw-grid vw-kpi-grid vw-gap-md" style={{ margin: '16px 0' }}>
        <KPICard title="Power Headroom" value={cap.power.headroom} suffix=" kW" icon={<ThunderboltOutlined />} iconTone="info" />
        <KPICard title="Net Available (− reservations & pipeline)" value={cap.power.availableNet} suffix=" kW" color={cap.power.availableNet < 0 ? 'var(--vw-color-red-600)' : undefined} icon={<ArrowRightOutlined />} iconTone="cyan" />
        <KPICard title="GPU Utilization" value={cap.gpu.util} suffix="%" icon={<CloudServerOutlined />} iconTone="purple" />
        <KPICard title="Cooling Headroom" value={cap.cooling.headroom} suffix=" kW" icon={<FireOutlined />} iconTone="cyan" />
        <KPICard title="Reserved (backlog)" value={extra.reservedBacklog} icon={<DatabaseOutlined />} iconTone="orange" />
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>{gauge('Space', cap.space.util, <ApartmentOutlined />, `${cap.space.used}/${cap.space.max} U`, '/capacity/space')}</Col>
        <Col xs={12} lg={6}>{gauge('Power', cap.power.util, <ThunderboltOutlined />, `${cap.power.used}/${cap.power.max} kW`, '/capacity/power', true)}</Col>
        <Col xs={12} lg={6}>{gauge('Cooling', cap.cooling.util, <FireOutlined />, `${cap.cooling.headroom} kW headroom`, '/capacity/power', true)}</Col>
        <Col xs={12} lg={6}>{gauge('Compute (GPU)', cap.gpu.util, <CloudServerOutlined />, `${cap.gpu.headroom} of ${cap.gpu.max} GPUs free`, '/capacity/compute')}</Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: "var(--vw-space-lg)" }}>
        <Col xs={24} lg={12}>
          <VwCard size="small" title="Capacity state (reservation ledger)" extra={<Button type="link" onClick={() => navigate('/capacity/space')}>Ledger →</Button>}>
            <StateBar segments={extra.rsvSeg} />
            <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", display: 'block', marginTop: 10 }}>Available → Reserved → Committed → Consumed. Reserved &amp; Committed are netted out of “Net Available”.</Text>
          </VwCard>
        </Col>
        <Col xs={24} lg={12}>
          <VwCard size="small" title="AI-density signals">
            <Space size="large">
              <div><div style={{ fontSize: "var(--vw-font-heading-2xl)", fontWeight: 600 }}>{extra.highDensity}</div><Text type="secondary">racks ≥30 kW</Text></div>
              <div><div style={{ fontSize: "var(--vw-font-heading-2xl)", fontWeight: 600 }}>{extra.liquidReady}</div><Text type="secondary">liquid-cooling ready</Text></div>
              <div><div style={{ fontSize: "var(--vw-font-heading-2xl)", fontWeight: 600 }}>{cap.gpu.headroom}</div><Text type="secondary">GPU slots free</Text></div>
            </Space>
            <div style={{ marginTop: "var(--vw-space-md)" }}><VwChip color="purple">AI-dense-native</VwChip><VwChip color="cyan">DLC aware</VwChip></div>
          </VwCard>
        </Col>
      </Row>

      <VwCard size="small" style={{ marginTop: "var(--vw-space-lg)" }}>
        <CapacityForecastPage embedded />
      </VwCard>
    </div>
  );
}
