import { useEffect } from 'react';
import { App, Modal, Form, Input, Select, InputNumber, Switch } from 'antd';
import { useEntityCreate, useEntityUpdate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { RACK_PURPOSE, POWER_REDUNDANCY } from '../../../mock/data/enums';
import type { Rack, Hall, DataCenter, Row } from '../../../mock/data/types';
import { db } from '../../../mock/db';

/** First free grid cell of a hall, scanning row by row; a full hall grows by one row. */
export function nextRackCell(hall: Pick<Hall, 'gridCols' | 'gridRows'> | undefined, occupied: Array<Pick<Rack, 'gridX' | 'gridY'>>): { gridX: number; gridY: number; gridRows: number } {
  const cols = Math.max(1, hall?.gridCols ?? 1);
  const gridRows = Math.max(1, hall?.gridRows ?? 1);
  const taken = new Set(occupied.map((r) => `${r.gridX},${r.gridY}`));
  for (let y = 0; y < gridRows; y++) for (let x = 0; x < cols; x++) if (!taken.has(`${x},${y}`)) return { gridX: x, gridY: y, gridRows };
  return { gridX: 0, gridY: gridRows, gridRows: gridRows + 1 };
}
import { dcTypeProfile } from '../../../mock/data/dcTypes';
import { ChangeRefSelect, useApprovedCRs } from '../../change';

export function RackFormModal({ open, onClose, rack }: { open: boolean; onClose: () => void; rack?: Rack }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const create = useEntityCreate('racks');
  const update = useEntityUpdate('racks');
  const audit = useRecordAudit();
  const halls = (useEntityList('halls', { pageSize: 2000 }).data?.data ?? []) as unknown as Hall[];
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  // Placement: a new rack takes the first free cell of its hall's grid and joins (or starts) the row at that line,
  // so it appears on the floor plan immediately instead of landing at (0,0) with no row. The hall's racks and rows
  // are read from the store at submit time so the placement never races the form.
  const updateHall = useEntityUpdate('halls');
  const createRow = useEntityCreate('rows');
  const updateRow = useEntityUpdate('rows');
  /** New racks inherit the facility type's physical defaults — height, density, redundancy, liquid readiness, tenant/owner. */
  const applyTypeDefaults = (hallId: string) => {
    const hall = halls.find((h) => h.id === hallId);
    const t = dcTypeProfile(dcs.find((d) => d.id === hall?.dataCenterId)?.dcTypeKey);
    if (!t) return;
    const [lo, hi] = t.kwPerRack ?? [8, 16];
    form.setFieldsValue({
      heightU: t.physical.rackHeightU, maxPowerKw: Math.round((lo + hi) / 2), redundancy: t.physical.redundancy,
      purpose: t.highDensity ? 'GPU' : t.segment === 'Telco' ? 'Network' : 'Compute',
      liquidCoolingReady: t.physical.liquidCooling === 'standard', owner: t.physical.tenants ? 'House' : form.getFieldValue('owner'),
    });
  };
  const approvedCRs = useApprovedCRs();
  const crRef = (id?: string) => approvedCRs.find((c) => c.id === id)?.ref ?? id ?? '';
  const editing = !!rack;

  useEffect(() => {
    if (open) {
      if (rack) form.setFieldsValue(rack);
      else form.resetFields();
    }
  }, [open, rack, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const ref = crRef(v.changeRef);
    if (editing && rack) {
      update.mutate({ id: rack.id, data: { name: v.name, heightU: v.heightU, maxPowerKw: v.maxPowerKw, purpose: v.purpose, redundancy: v.redundancy, liquidCoolingReady: !!v.liquidCoolingReady, owner: v.owner } },
        { onSuccess: () => { message.success('Rack updated'); audit('Rack', rack.rackId, 'updated', `Edited ${rack.name} [CR ${ref}]`); onClose(); } });
    } else {
      const hall = halls.find((h) => h.id === v.hallId);
      const id = `RACK-NEW-${Date.now().toString().slice(-4)}`;
      const now = new Date().toISOString();
      const envelope = { customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me' };
      const hallRacks = db.getAll('racks', { filters: [{ field: 'hallId', operator: 'eq', value: v.hallId }], pageSize: 5000 }).data as unknown as Rack[];
      const hallRows = db.getAll('rows', { filters: [{ field: 'hallId', operator: 'eq', value: v.hallId }], pageSize: 500 }).data as unknown as Row[];
      const { gridX, gridY, gridRows } = nextRackCell(hall, hallRacks);
      const cols = Math.max(1, hall?.gridCols ?? 1);
      const existingRow = hallRows.find((r) => r.gridPosition === String(gridY));
      let rowId = existingRow?.id;
      if (existingRow) updateRow.mutate({ id: existingRow.id, data: { rackCount: (existingRow.rackCount ?? 0) + 1 } });
      else {
        rowId = `ROW-NEW-${Date.now().toString().slice(-4)}`;
        createRow.mutate({ id: rowId, rowId, ...envelope, hallId: v.hallId, name: `Row ${String.fromCharCode(65 + gridY)}`, gridPosition: String(gridY), containment: hallRows[0]?.containment ?? 'None', rackCount: 1 });
      }
      if (hall) {
        const rackCount = (hall.rackCount ?? 0) + 1; const rackCapacity = cols * gridRows;
        updateHall.mutate({ id: hall.id, data: { gridRows, rackCount, rackCapacity, utilizationPct: Math.round((rackCount / rackCapacity) * 100) } });
      }
      create.mutate({
        id, rackId: id, rowId: rowId ?? '', hallId: v.hallId, dataCenterId: hall?.dataCenterId ?? '', name: v.name,
        gridX, gridY, heightU: v.heightU, usedU: 0, availableU: v.heightU, widthMm: 600, depthMm: 1070,
        maxWeightKg: 1200, currentWeightKg: 0, maxPowerKw: v.maxPowerKw, currentPowerKw: 0, powerUtilizationPct: 0,
        redundancy: v.redundancy, thermalDensityKwPerRack: 0, purpose: v.purpose, status: 'Planned',
        liquidCoolingReady: !!v.liquidCoolingReady, owner: v.owner || 'Unassigned', ...envelope,
      }, { onSuccess: () => { message.success(`Rack created at grid ${String.fromCharCode(65 + gridY)}${gridX + 1} in ${hall?.name ?? 'hall'}`); audit('Rack', id, 'created', `Created ${v.name} at ${hall?.name ?? 'hall'} row ${String.fromCharCode(65 + gridY)} [CR ${ref}]`); onClose(); } });
    }
  };

  return (
    <Modal title={editing ? `Edit ${rack?.name}` : 'New rack'} open={open} onOk={submit} onCancel={onClose} okText={editing ? 'Save' : 'Create'} destroyOnClose>
      <Form form={form} layout="vertical" initialValues={{ heightU: 42, maxPowerKw: 12, purpose: 'Compute', redundancy: 'N+1' }}>
        <Form.Item name="name" label="Rack name" rules={[{ required: true }]}><Input placeholder="R-A07" /></Form.Item>
        {!editing && <Form.Item name="hallId" label="Hall" rules={[{ required: true }]}><Select placeholder="Select hall" showSearch optionFilterProp="label" onChange={applyTypeDefaults} options={halls.map((h) => ({ value: h.id, label: `${h.name} · ${dcs.find((d) => d.id === h.dataCenterId)?.name ?? ''}` }))} /></Form.Item>}
        <Form.Item name="purpose" label="Purpose"><Select placeholder="Select purpose" options={RACK_PURPOSE.map((p) => ({ value: p, label: p }))} /></Form.Item>
        <Form.Item name="heightU" label="Height (U)"><InputNumber placeholder="Enter height (U)" min={20} max={60} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="maxPowerKw" label="Power budget (kW)"><InputNumber placeholder="Enter power budget (kW)" min={1} max={200} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="redundancy" label="Power redundancy"><Select placeholder="Select power redundancy" options={POWER_REDUNDANCY.map((p) => ({ value: p, label: p }))} /></Form.Item>
        <Form.Item name="owner" label="Owner team"><Input placeholder="AI/ML" /></Form.Item>
        <Form.Item name="liquidCoolingReady" label="Liquid-cooling ready" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="changeRef" label="Authorizing change request" rules={[{ required: true, message: 'Select an approved change request' }]}><ChangeRefSelect /></Form.Item>
      </Form>
    </Modal>
  );
}
export default RackFormModal;
