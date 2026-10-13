import { useMemo, useState } from 'react';
import { Input } from 'antd';
import { Bot, MessageSquare, Send, Sparkles } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, Panel } from '../../../ops/ui/kit';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import type { Rack, ComputeResource, Subnet, ManagedDevice } from '../../../mock/data/types';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';
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

  const fallback = 'In the prototype, try one of the preset scenarios above for a computed answer.';

  return (
    <OpsPage title="AI Copilot" description="Ask about capacity, network and incidents — answers are computed from live estate data"
      actions={<><Chip tone="purple">demo-grade</Chip><PageDcScopeSelect /></>}>
      <Panel title="Suggested questions" icon={Sparkles}>
        <div className="row wrap">
          {presets.map((p) => <Btn key={p.label} onClick={() => ask(p.label, p.a)}>{p.label}</Btn>)}
        </div>
      </Panel>

      <Panel title="Conversation" icon={MessageSquare} count={log.length || undefined}
        foot={
          <div className="row" style={{ width: '100%' }}>
            <Input aria-label="Message to AI Copilot" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about capacity, network, incidents…"
              onPressEnter={() => text && ask(text, fallback)} />
            <Btn variant="filled" icon={Send} title="Send message" disabled={!text} onClick={() => text && ask(text, fallback)} />
          </div>
        }>
        <div style={{ minHeight: 240 }}>
          {log.length === 0 ? <Empty icon={Bot} title="No questions yet">Ask a preset question above, or type your own.</Empty> : log.map((e, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ textAlign: 'right', marginBottom: 6 }}><span style={{ background: "var(--vw-color-slate-900)", color: '#fff', padding: '6px 12px', borderRadius: "var(--vw-radius-md)", fontSize: "var(--vw-font-label-md)", display: 'inline-block' }}>{e.q}</span></div>
              <div><span style={{ background: "var(--vw-color-slate-100)", color: "var(--vw-color-slate-900)", padding: '8px 12px', borderRadius: "var(--vw-radius-md)", fontSize: "var(--vw-font-label-md)", display: 'inline-flex', gap: 6, alignItems: 'flex-start', maxWidth: '85%' }}><Bot size={15} style={{ color: "var(--vw-color-violet-600)", flex: 'none', marginTop: 2 }} /><span>{e.a}</span></span></div>
            </div>
          ))}
        </div>
      </Panel>
    </OpsPage>
  );
}
