import { useEffect } from 'react';
import { App, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useEntityList, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { DC_TIERS, FACILITY_STATUS, DC_SEGMENT, type DcTypeKey } from '../../../mock/data/enums';
import { DC_TYPES_BY_SEGMENT, dcTypeProfile, dcTypeDefaults, fmtRange, fmtPowerRange } from '../../../mock/data/dcTypes';
import type { DataCenter, Campus } from '../../../mock/data/types';
import { VwChip } from '../../../shared/components/ux';

const { Text } = Typography;

/**
 * Edit a data centre's identity and classification — name, code, campus, facility
 * type, tier, status, design power / cooling, location, notes. Creation stays in
 * the onboarding wizard (it also builds the floors, halls, racks and plant).
 * Changing the type re-suggests the tier from the new profile; every other field is kept.
 */
export function DataCenterFormModal({ open, onClose, dc }: { open: boolean; onClose: () => void; dc: DataCenter }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const qc = useQueryClient();
  const update = useEntityUpdate('dataCenters');
  const audit = useRecordAudit();
  const campuses = (useEntityList('campuses', { pageSize: 500 }).data?.data ?? []) as unknown as Campus[];
  const typeKey = Form.useWatch('dcTypeKey', form) as DcTypeKey | undefined;
  const profile = dcTypeProfile(typeKey);

  useEffect(() => {
    if (open) form.setFieldsValue({
      name: dc.name, code: dc.code, campusId: dc.campusId, dcTypeKey: dc.dcTypeKey, tier: dc.tier, status: dc.status,
      designPowerKw: dc.designPowerKw, designCoolingKw: dc.designCoolingKw, latitude: dc.latitude, longitude: dc.longitude, notes: dc.notes,
    });
  }, [open, dc, form]);

  const onType = (k?: DcTypeKey) => {
    if (!k) return;
    const d = dcTypeDefaults(k);
    form.setFieldsValue({ tier: d.tier });
  };

  const submit = async () => {
    const v = await form.validateFields();
    const before = dcTypeProfile(dc.dcTypeKey)?.name ?? 'untyped';
    const after = dcTypeProfile(v.dcTypeKey)?.name ?? 'untyped';
    update.mutate({ id: dc.id, data: {
      name: v.name, code: v.code, campusId: v.campusId, dcTypeKey: v.dcTypeKey, tier: v.tier, status: v.status,
      designPowerKw: v.designPowerKw, designCoolingKw: v.designCoolingKw, latitude: v.latitude, longitude: v.longitude, notes: v.notes,
      updatedAt: new Date().toISOString(), updatedBy: 'You',
    } }, {
      onSuccess: () => {
        audit('DataCenter', dc.dcId, 'updated', `Edited ${v.name}${before !== after ? ` — type ${before} → ${after}` : ''}`);
        ['dataCenters', 'campuses'].forEach((e) => qc.invalidateQueries({ queryKey: [e] }));
        message.success('Data center updated');
        onClose();
      },
    });
  };

  return (
    <Modal title={`Edit ${dc.name}`} open={open} onOk={submit} onCancel={onClose} okText="Save" destroyOnClose width={640}>
      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: "var(--vw-space-lg)" }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="Enter name" /></Form.Item>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}><Input placeholder="Enter code" onChange={(e) => form.setFieldValue('code', e.target.value.toUpperCase())} /></Form.Item>
        </div>
        <Form.Item name="campusId" label="Campus" rules={[{ required: true }]}>
          <Select placeholder="Select campus" showSearch optionFilterProp="label" options={campuses.map((c) => ({ value: c.id, label: `${c.name} · ${c.city}` }))} />
        </Form.Item>
        <Form.Item name="dcTypeKey" label="Facility type" tooltip="Sets defaults, filters, build blueprint and capacity policy for this site. Leave empty for tier-only behaviour.">
          <Select allowClear showSearch optionFilterProp="label" placeholder="Untyped" onChange={onType}
            options={DC_SEGMENT.map((seg) => ({ label: seg, options: DC_TYPES_BY_SEGMENT[seg].map((t) => ({ value: t.key, label: t.name })) }))} />
        </Form.Item>
        {profile && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '-8px 0 14px' }}>
            <VwChip color={profile.segment === 'Telco' ? 'purple' : 'blue'}>{profile.segment}</VwChip>
            <VwChip>{fmtRange(profile.typicalRacks)} racks</VwChip>
            <VwChip>{fmtPowerRange(profile.powerKw)}</VwChip>
            {profile.kwPerRack && <VwChip>{profile.kwPerRack[0]}–{profile.kwPerRack[1]} kW/rack</VwChip>}
            <VwChip>{profile.cooling}</VwChip>
            <VwChip>{profile.redundancy}</VwChip>
            <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", width: '100%' }}>Policy: warn ≥ {profile.capacity.rackPowerWarnPct}% · block ≥ {profile.capacity.rackPowerBlockPct}% rack power · cooling floor {profile.capacity.coolingHeadroomMinPct}% · PUE target ≤ {profile.pueTarget} · blueprint {profile.build.blueprintKey}</Text>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: "var(--vw-space-lg)" }}>
          <Form.Item name="tier" label="Tier" rules={[{ required: true }]}><Select placeholder="Select tier" options={DC_TIERS.map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}><Select placeholder="Select status" options={FACILITY_STATUS.map((s) => ({ value: s, label: s }))} /></Form.Item>
          <Form.Item name="designPowerKw" label="Design power (kW)" rules={[{ required: true }]}><InputNumber placeholder="Enter design power (kW)" min={1} step={50} style={{ width: '100%' }} /></Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', columnGap: "var(--vw-space-lg)" }}>
          <Form.Item name="designCoolingKw" label="Design cooling (kW)"><InputNumber placeholder="Enter design cooling (kW)" min={0} step={50} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="latitude" label="Latitude"><InputNumber placeholder="Enter latitude" step={0.01} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="longitude" label="Longitude"><InputNumber placeholder="Enter longitude" step={0.01} style={{ width: '100%' }} /></Form.Item>
        </div>
        <Form.Item name="notes" label="Notes"><Input.TextArea placeholder="Enter notes" autoSize={{ minRows: 2, maxRows: 4 }} /></Form.Item>
      </Form>
    </Modal>
  );
}

export default DataCenterFormModal;
