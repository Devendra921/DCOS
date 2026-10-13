import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Modal, Menu, Typography, Empty } from 'antd';
import { VwButton as Button } from '../../shared/components/vw/VwButton';

import { ReadOutlined, InfoCircleOutlined, ApartmentOutlined, ArrowRightOutlined, CloseOutlined } from '../../shared/icons';
import { getSynopsis } from './synopsis';
import { useActiveSynopsis } from './SynopsisContext';
import { PLAYBOOK } from './playbook';
import type { DocBlock } from './types';
import { VwChip } from '../../shared/components/ux';

const { Title, Paragraph, Text } = Typography;

function BlockCard({ b }: { b: DocBlock }) {
  const tint = b.tone === 'tint';
  return (
    <div style={{ border: '1px solid #eef2f6', background: tint ? '#f0f7ff' : '#fff', borderRadius: 10, padding: '14px 16px', marginBottom: "var(--vw-space-md)" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", marginBottom: b.body || b.bullets ? 8 : 0 }}>
        {b.icon}
        <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>{b.title}</Text>
      </div>
      {b.body && <Paragraph style={{ margin: 0, color: "var(--vw-color-slate-600)", fontSize: "var(--vw-font-label-md)" }}>{b.body}</Paragraph>}
      {b.bullets && (
        <ul style={{ margin: b.body ? '8px 0 0' : 0, paddingLeft: 18, color: "var(--vw-color-slate-600)", fontSize: "var(--vw-font-label-md)" }}>
          {b.bullets.map((x, i) => <li key={i} style={{ marginBottom: "var(--vw-space-xxs)" }}>{x}</li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * In-layout contextual help — Playbook (modal) + Synopsis (docked panel).
 * Trigger icons live in the app Header (see AppLayout) so they're always
 * reachable, in both full-chrome and headless/embedded builds. This hook
 * owns all the state; `HelpRailPanel`/`HelpRailModal` render it.
 */
export function useHelpRail() {
  const location = useLocation();
  const navigate = useNavigate();
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [synopsisOpen, setSynopsisOpen] = useState(false);
  const [expand, setExpand] = useState(false);

  // Prefer the doc the current screen registered (co-located, scalable);
  // fall back to the path-keyed registry so nothing is ever blank.
  const registered = useActiveSynopsis();
  const synopsis = useMemo(() => registered ?? getSynopsis(location.pathname), [registered, location.pathname]);
  const seg = location.pathname.split('/').filter(Boolean)[0] ?? 'overview';
  const [activeKey, setActiveKey] = useState<string>('overview');
  const openPlaybook = () => {
    const match = PLAYBOOK.find((m) => m.key === seg) ?? PLAYBOOK[0];
    setActiveKey(match.key);
    setPlaybookOpen(true);
  };
  const toggleSynopsis = () => setSynopsisOpen((o) => !o);
  const active = PLAYBOOK.find((m) => m.key === activeKey) ?? PLAYBOOK[0];

  return {
    navigate, playbookOpen, setPlaybookOpen, synopsisOpen, setSynopsisOpen, expand, setExpand,
    synopsis, openPlaybook, toggleSynopsis, activeKey, setActiveKey, active,
  };
}

export type HelpRailState = ReturnType<typeof useHelpRail>;

/** Docked Synopsis panel — flex sibling of page content, so opening it reflows (not overlays) the page. */
export function HelpRailPanel({ help }: { help: HelpRailState }) {
  const { synopsisOpen, setSynopsisOpen, synopsis, openPlaybook } = help;
  return (
    <>
      {synopsisOpen && (
        <>
          {/* Docked-sibling reflow (see the doc comment above) assumes a
              desktop-width Content column either side of this 420px rail.
              Below ~768px there's no room for both, so the rail would
              squeeze Content to a sliver and clip its own text/close button
              past the viewport edge — becoming effectively stuck open with
              no visible way to dismiss it. Below that breakpoint it becomes
              a full-viewport overlay instead, closable the normal way. */}
          <style>{`
            @media (max-width: 768px) {
              .help-rail-panel { position: fixed; inset: 0; width: 100% !important; z-index: 1000; }
            }
          `}</style>
          <aside className="help-rail-panel" style={{ width: 420, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: "1px solid var(--vw-color-gray-200)", overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", padding: '14px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <InfoCircleOutlined style={{ fontSize: "var(--vw-font-heading-md)" }} />
            <Text strong>Synopsis</Text>
            <Button type="text" size="small" icon={<CloseOutlined />} style={{ marginLeft: 'auto' }} onClick={() => setSynopsisOpen(false)} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>
            <Title level={4} style={{ marginTop: 0, marginBottom: "var(--vw-space-xxs)" }}>{synopsis.title}</Title>
            {synopsis.summary && <Paragraph type="secondary" style={{ marginBottom: "var(--vw-space-lg)" }}>{synopsis.summary}</Paragraph>}
            {synopsis.stub && <VwChip color="default" style={{ marginBottom: "var(--vw-space-md)" }}>Page guidance in progress</VwChip>}
            {synopsis.blocks.map((b, i) => <BlockCard key={i} b={b} />)}
            <Button type="link" style={{ paddingLeft: 0 }} icon={<ReadOutlined />} onClick={openPlaybook}>Open the full Playbook</Button>
          </div>
          </aside>
        </>
      )}
    </>
  );
}

/** Playbook — whole-app guide, modal. Opened via the header's Playbook icon. */
export function HelpRailModal({ help }: { help: HelpRailState }) {
  const { playbookOpen, setPlaybookOpen, expand, setExpand, activeKey, setActiveKey, active, navigate } = help;
  return (
    <Modal
      open={playbookOpen}
      onCancel={() => setPlaybookOpen(false)}
      footer={null}
      width={expand ? '94vw' : 980}
      style={{ top: 40 }}
      styles={{ body: { padding: 0 } }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ApartmentOutlined style={{ fontSize: "var(--vw-font-heading-lg)" }} />
          <div>
            <div style={{ fontWeight: 700 }}>DCOS Playbook</div>
            <div style={{ fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)", fontWeight: 400 }}>Operational guidance for the platform and each module</div>
          </div>
          <Button size="small" type="text" style={{ marginLeft: 'auto', marginRight: "var(--vw-space-2xl)" }} onClick={() => setExpand((e) => !e)}>{expand ? 'Shrink' : 'Expand'}</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', height: expand ? '78vh' : 560 }}>
        <div style={{ width: 260, borderRight: '1px solid #f0f0f0', overflowY: 'auto', flexShrink: 0 }}>
          <Menu
            mode="inline"
            selectedKeys={[activeKey]}
            onClick={({ key }) => setActiveKey(key)}
            style={{ borderRight: 'none' }}
            items={PLAYBOOK.map((m) => ({ key: m.key, label: <span>{m.label}{m.stub && <VwChip style={{ marginLeft: 6, fontSize: "var(--vw-font-label-xs)" }}>soon</VwChip>}</span> }))}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: "var(--vw-space-md)" }}>
            <Title level={4} style={{ margin: 0 }}>{active.label}</Title>
            {active.route && (
              <Button type="link" icon={<ArrowRightOutlined />} onClick={() => { setPlaybookOpen(false); navigate(active.route!); }}>Open module</Button>
            )}
          </div>
          {active.stub && <VwChip color="default" style={{ marginBottom: "var(--vw-space-md)" }}>Chapter in progress</VwChip>}
          {active.sections.length === 0 && <Empty description="No content yet" />}
          {active.sections.map((s, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>{s.heading}</Text>
              {s.body && <Paragraph style={{ margin: '6px 0 0', color: "var(--vw-color-slate-600)" }}>{s.body}</Paragraph>}
              {s.bullets && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: "var(--vw-color-slate-600)" }}>
                  {s.bullets.map((b, j) => <li key={j} style={{ marginBottom: "var(--vw-space-xxs)" }}>{b}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
