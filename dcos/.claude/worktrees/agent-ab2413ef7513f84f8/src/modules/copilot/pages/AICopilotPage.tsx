import { useMemo, useState } from 'react';
import { Input, Typography, Space } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';

import { RobotOutlined, SendOutlined } from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { Rack, ComputeResource, Subnet, ManagedDevice } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
const { Text } = Typography;
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

export default function AICopilotPage() {
  const racks = (useEntityList('racks', { pageSize: 10000 }).data?.data ?? []) as unknown as Rack[];
  const comp = (useEntityList('computeResources', { pageSize: 200 }).data?.data ?? []) as unknown as ComputeResource[];
  const subnets = (useEntityList('subnets', { pageSize: 500 }).data?.data ?? []) as unknown as Subnet[];
  const devices = (useEntityList('managedDevices', { pageSize: 5000 }).data?.data ?? []) as unknown as ManagedDevice[];
  const [log, setLog] = useState<{ q: string; a: string }[]>([]);
  const [text, setText] = useState('');

  const answers = useMemo(() => {
    const gpuFree = sum(comp.map((c) => c.gpuCountTotal - c.gpuCountUsed));
    const powerHeadroom = Math.round(sum(racks.map((r) => r.maxPowerKw - r.currentPowerKw)));
    const liquidReady = racks.filter((r) => r.purpose === 'GPU' && r.liquidCoolingReady).length;
    const hotSubnets = subnets.filter((s) => s.utilizationPct >= 85);
    const tor = devices.find((d) => d.role === 'TOR') ?? devices[0];
    return {
      gpu: `Yes — provisionally. The estate has ${gpuFree} GPU slots free and ${powerHeadroom.toLocaleString()} kW power headroom. ${liquidReady} GPU racks are liquid-cooling ready (needed above 40 kW/rack). Recommend reserving capacity and raising a governed RackDeploy change for 300 GPUs.`,
      subnet: hotSubnets.length ? `${hotSubnets.length} subnet(s) are ≥85% utilized and at exhaustion risk: ${hotSubnets.slice(0, 3).map((s) => `${s.cidr} (${s.utilizationPct}%)`).join(', ')}${hotSubnets.length > 3 ? '…' : ''}.` : 'No subnets are currently above 85% utilization.',
      latency: `Likely a network fault. There are active alarms on TOR/leaf devices; correlate the Hall's switches in the NMS alarm console and check interface utilization. If confirmed, promote to an incident — the impact graph shows downstream services.`,
      impact: tor ? `If ${tor.hostname} (${tor.role}) fails: downstream hosts and the services they back are impacted. Open Data Flow Intelligence and select the device to see the full blast radius before scheduling any change.` : 'No device selected.',
    };
  }, [racks, comp, subnets, devices]);

  const ask = (q: string, a: string) => { setLog((l) => [...l, { q, a }]); setText(''); };
  const presets = [
    { label: 'Can we deploy 300 GPUs next quarter?', a: answers.gpu },
    { label: 'Which subnets will exhaust in 6 months?', a: answers.subnet },
    { label: 'Why did latency increase in Hall B?', a: answers.latency },
    { label: 'What is impacted if TOR-SW-22 fails?', a: answers.impact },
  ];

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="vw-card-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: "var(--vw-space-xxs)", flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
        <Space align="center">
          <div className="vw-page-title" role="heading" aria-level={3}><RobotOutlined /> AI Copilot</div><VwChip color="purple">demo-grade</VwChip>
        </Space>
        <PageDcScopeSelect />
      </div>
      <Space wrap style={{ marginBottom: "var(--vw-space-lg)" }}>
        {presets.map((p) => <Button key={p.label} onClick={() => ask(p.label, p.a)}>{p.label}</Button>)}
      </Space>
      <VwCard size="small" style={{ minHeight: 240, marginBottom: "var(--vw-space-md)" }}>
        {log.length === 0 ? <Text type="secondary">Ask a preset question above, or type your own.</Text> : log.map((e, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ textAlign: 'right', marginBottom: 6 }}><span style={{ background: "var(--vw-color-slate-900)", color: '#fff', padding: '6px 12px', borderRadius: "var(--vw-radius-md)", fontSize: "var(--vw-font-label-md)", display: 'inline-block' }}>{e.q}</span></div>
            <div><span style={{ background: "var(--vw-color-slate-100)", color: "var(--vw-color-slate-900)", padding: '8px 12px', borderRadius: "var(--vw-radius-md)", fontSize: "var(--vw-font-label-md)", display: 'inline-block', maxWidth: '85%' }}><RobotOutlined style={{ color: "var(--vw-color-violet-600)", marginRight: 6 }} />{e.a}</span></div>
          </div>
        ))}
      </VwCard>
      <Space.Compact style={{ width: '100%' }}>
        <Input aria-label="Message to AI Copilot" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about capacity, network, incidents…"
          onPressEnter={() => text && ask(text, 'In the prototype, try one of the preset scenarios above for a computed answer.')} />
        <Button aria-label="Send message" disabled={!text} type="primary" icon={<SendOutlined />} onClick={() => text && ask(text, 'In the prototype, try one of the preset scenarios above for a computed answer.')} />
      </Space.Compact>
    </div>
  );
}
