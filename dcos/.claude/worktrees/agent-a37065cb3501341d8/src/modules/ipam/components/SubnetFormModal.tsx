import { useEffect } from 'react';
import { App, Modal, Form, Input, Select, InputNumber, Switch } from 'antd';
import { useEntityCreate, useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { SUBNET_PURPOSE, PREFIX_STATUS } from '../../../mock/data/enums';
import type { DataCenter, VLAN, Subnet, IpamRole } from '../../../mock/data/types';

export function SubnetFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const create = useEntityCreate('subnets');
  const audit = useRecordAudit();
  const dcs = (useEntityList('dataCenters', { pageSize: 100 }).data?.data ?? []) as unknown as DataCenter[];
  const vlans = (useEntityList('vlans', { pageSize: 500 }).data?.data ?? []) as unknown as VLAN[];
  const roles = (useEntityList('ipamRoles', { pageSize: 500 }).data?.data ?? []) as unknown as IpamRole[];
  const subnets = (useEntityList('subnets', { pageSize: 1000 }).data?.data ?? []) as unknown as Subnet[];
  const containers = subnets.filter((s) => s.status === 'Container');
  useEffect(() => { if (open) form.resetFields(); }, [open, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const id = `SUBNET-NEW-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();
    const base = (v.cidr as string).split('/')[0].replace(/\.\d+$/, '.1');
    // role inheritance: if no role chosen but a parent container is, inherit the parent's role
    const parent = v.parentId ? containers.find((c) => c.id === v.parentId) : undefined;
    const roleId = v.roleId ?? parent?.roleId;
    create.mutate({
      id, subnetId: id, cidr: v.cidr, name: v.name, purpose: v.purpose, status: v.status ?? 'Active',
      parentId: v.parentId, roleId, isPool: !!v.isPool, markUtilized: false,
      totalHosts: v.totalHosts, usedHosts: 0, utilizationPct: 0,
      state: 'Available', gatewayIp: base, dataCenterId: v.dataCenterId, vlanId: v.vlanId,
      customerId: 'CUST-001', isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me',
    }, { onSuccess: () => { message.success('Prefix created'); audit('Subnet', id, 'created', `Created ${v.cidr}`); onClose(); } });
  };

  return (
    <Modal title="New prefix" open={open} onOk={submit} onCancel={onClose} okText="Create" destroyOnClose>
      <Form form={form} layout="vertical" initialValues={{ purpose: 'Production', status: 'Active', totalHosts: 254 }}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="prefix-prod-01" /></Form.Item>
        <Form.Item name="cidr" label="CIDR" rules={[{ required: true }]}><Input placeholder="10.20.30.0/24" /></Form.Item>
        <Form.Item name="status" label="Status"><Select placeholder="Select status" options={PREFIX_STATUS.map((p) => ({ value: p, label: p }))} /></Form.Item>
        <Form.Item name="parentId" label="Parent container" tooltip="Nest this prefix under a container prefix; role is inherited if left blank.">
          <Select allowClear showSearch optionFilterProp="label" placeholder="(top-level)" options={containers.map((c) => ({ value: c.id, label: `${c.cidr} · ${c.name}` }))} />
        </Form.Item>
        <Form.Item name="roleId" label="Role"><Select placeholder="Select role" allowClear showSearch optionFilterProp="label" options={roles.map((r) => ({ value: r.id, label: r.name }))} /></Form.Item>
        <Form.Item name="purpose" label="Purpose"><Select placeholder="Select purpose" options={SUBNET_PURPOSE.map((p) => ({ value: p, label: p }))} /></Form.Item>
        <Form.Item name="isPool" label="Is a pool (treat all IPs as usable)" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name="totalHosts" label="Usable hosts"><InputNumber placeholder="Enter usable hosts" min={2} max={65536} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="dataCenterId" label="Data center" rules={[{ required: true }]}><Select placeholder="Select data center" options={dcs.map((d) => ({ value: d.id, label: d.name }))} /></Form.Item>
        <Form.Item name="vlanId" label="VLAN"><Select placeholder="Select VLAN" allowClear showSearch optionFilterProp="label" options={vlans.slice(0, 100).map((v) => ({ value: v.id, label: `${v.vlanNumber} · ${v.name}` }))} /></Form.Item>
      </Form>
    </Modal>
  );
}
export default SubnetFormModal;
