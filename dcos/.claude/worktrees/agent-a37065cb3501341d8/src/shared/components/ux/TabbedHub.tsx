import type { ReactNode } from 'react';
import { Space, Tabs } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageDcScopeSelect } from '../../../core/scope/DcScope';

export interface HubTab { label: string; path: string; el: ReactNode }

/** URL-synced module tabs. The scope/actions occupy their own grid track so
 * rc-tabs can measure its scrollable strip without a wrapping extra-content row. */
export function TabbedHub({ tabs, extra }: { tabs: HubTab[]; extra?: ReactNode }) {
  const loc = useLocation();
  const nav = useNavigate();
  const active = tabs.find((t) => t.path === loc.pathname)?.path ?? tabs[0].path;
  return (
    <div className="vw-flex vw-flex-col vw-page-gap" style={{ minWidth: 0 }}>
      <div className="vw-card-section vw-hub-header">
        <Tabs
          className="tabbed-hub-tabs"
          activeKey={active}
          onChange={(k) => nav(k)}
          items={tabs.map((t) => ({ key: t.path, label: t.label }))}
        />
        <Space className="vw-hub-actions" size={12} align="center" wrap>
          {extra}<PageDcScopeSelect />
        </Space>
      </div>
      <div style={{ minWidth: 0 }}>{tabs.find((t) => t.path === active)?.el}</div>
    </div>
  );
}
export default TabbedHub;
