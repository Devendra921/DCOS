import { useState } from 'react';
import { Drawer, Tooltip } from 'antd';
import { VwButton as Button } from '../shared/components/vw/VwButton';

import { RobotOutlined, CloseOutlined } from '../shared/icons';
import AICopilotPage from '../modules/copilot/pages/AICopilotPage';

/** Global AI Copilot launcher — floating button opens an overlay drawer. */
export default function CopilotFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title="AI Copilot" placement="left">
        <Button aria-label="Open AI Copilot" aria-expanded={open} aria-haspopup="dialog" type="primary" shape="circle" size="large" icon={<RobotOutlined />} onClick={() => setOpen(true)}
          style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 70, width: 52, height: 52, boxShadow: '0 4px 14px rgba(15,23,42,0.2)' }} />
      </Tooltip>
      <Drawer mask={false} title={<span><RobotOutlined /> AI Copilot</span>} placement="right" width="min(520px, 100vw)" open={open} onClose={() => setOpen(false)}
        closeIcon={<CloseOutlined />} styles={{ body: { padding: 0 } }}>
        <AICopilotPage />
      </Drawer>
    </>
  );
}
