import React, { useState } from 'react';
import { Dropdown, Input, Modal, Tooltip } from 'antd';
import { VwButton as Button } from '../vw/VwButton';

import { BookOutlined, StarOutlined, DeleteOutlined, SaveOutlined, DownOutlined } from '../../icons';
import type { SavedView } from '../../hooks/useSavedViews';
import { UX } from './uxTokens';
import { VwChip } from './VwChip';

export interface SavedViewsDropdownProps<T> {
  views: SavedView<T>[];
  currentFilters: T;
  onApply: (filters: T) => void;
  onSave: (name: string) => void;
  onRemove: (id: string) => void;
}

export function SavedViewsDropdown<T>({ views, onApply, onSave, onRemove }: SavedViewsDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <>
      <Dropdown
        open={open}
        onOpenChange={setOpen}
        trigger={['click']}
        menu={{
          items: [
            {
              key: 'save',
              icon: <SaveOutlined />,
              label: 'Save current view…',
              onClick: () => { setOpen(false); setSaveOpen(true); },
            },
            { type: 'divider' as const },
            ...(views.length === 0
              ? [{ key: 'empty', disabled: true, label: 'No saved views' }]
              : views.map((v) => ({
                  key: v.id,
                  label: (
                    <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", minWidth: 220 }}>
                      <StarOutlined style={{ color: UX.amber }} />
                      <span style={{ flex: 1 }}>{v.name}</span>
                      <VwChip style={{ marginRight: 0 }} color="default">{new Date(v.createdAt).toLocaleDateString()}</VwChip>
                      <Tooltip title="Delete">
                        <DeleteOutlined
                          style={{ color: UX.muted }}
                          onClick={(e) => { e.stopPropagation(); onRemove(v.id); }}
                        />
                      </Tooltip>
                    </div>
                  ),
                  onClick: () => { onApply(v.filters); setOpen(false); },
                }))),
          ],
        }}
      >
        <Button size="small" icon={<BookOutlined />}>
          My Views ({views.length}) <DownOutlined style={{ fontSize: "var(--vw-font-label-xs)" }} />
        </Button>
      </Dropdown>
      <Modal
        title="Save view"
        open={saveOpen}
        onCancel={() => setSaveOpen(false)}
        onOk={() => {
          if (!name.trim()) return;
          onSave(name.trim());
          setName('');
          setSaveOpen(false);
        }}
        okText="Save"
      >
        <p style={{ color: UX.muted, marginBottom: "var(--vw-space-md)" }}>
          Saves the current filters and search as a named view. Views are stored locally per user.
        </p>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. 'My region, critical only'"
          onPressEnter={() => {
            if (name.trim()) {
              onSave(name.trim());
              setName('');
              setSaveOpen(false);
            }
          }}
        />
      </Modal>
    </>
  );
}

export default SavedViewsDropdown;
