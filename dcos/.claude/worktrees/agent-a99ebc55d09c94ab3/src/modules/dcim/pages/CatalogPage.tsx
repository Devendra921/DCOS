import { useState } from 'react';
import { App, Col, Form, Input, Modal, Row, Typography } from 'antd';
import { VwButton as Button } from '../../../shared/components/vw/VwButton';
import { VwTable as Table } from '../../../shared/components/vw/VwTable';

import { PlusOutlined } from '../../../shared/icons';
import type { TableColumnType } from 'antd';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import type { Manufacturer, DeviceRoleEntity, PlatformEntity, InventoryItemRole, SiteGroup, RackRole, RackType, RackGroup } from '../../../mock/data/types';
import { VwCard, VwChip } from '../../../shared/components/ux';
import { TABLE_STICKY } from '../../../shared/utils/tableSticky';

const { Text } = Typography;
const now = () => new Date().toISOString();
const env = () => ({ customerId: 'CUST-001', isDeleted: false, createdAt: now(), updatedAt: now(), createdBy: 'You', createdById: 'me' });
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

type CatKind = 'manufacturer' | 'role' | 'platform' | 'invrole' | 'sitegroup' | 'rackrole' | 'racktype' | 'rackgroup';

export default function CatalogPage() {
  const { message } = App.useApp();
  const manufacturers = (useEntityList('manufacturers', { pageSize: 200 }).data?.data ?? []) as unknown as Manufacturer[];
  const roles = (useEntityList('deviceRoles', { pageSize: 200 }).data?.data ?? []) as unknown as DeviceRoleEntity[];
  const platforms = (useEntityList('platforms', { pageSize: 200 }).data?.data ?? []) as unknown as PlatformEntity[];
  const invRoles = (useEntityList('inventoryItemRoles', { pageSize: 200 }).data?.data ?? []) as unknown as InventoryItemRole[];
  const siteGroups = (useEntityList('siteGroups', { pageSize: 200 }).data?.data ?? []) as unknown as SiteGroup[];
  const rackRoles = (useEntityList('rackRoles', { pageSize: 200 }).data?.data ?? []) as unknown as RackRole[];
  const rackTypes = (useEntityList('rackTypes', { pageSize: 200 }).data?.data ?? []) as unknown as RackType[];
  const rackGroups = (useEntityList('rackGroups', { pageSize: 200 }).data?.data ?? []) as unknown as RackGroup[];
  const createMfr = useEntityCreate('manufacturers');
  const createRole = useEntityCreate('deviceRoles');
  const createPlat = useEntityCreate('platforms');
  const createIir = useEntityCreate('inventoryItemRoles');
  const createSg = useEntityCreate('siteGroups');
  const createRr = useEntityCreate('rackRoles');
  const createRt = useEntityCreate('rackTypes');
  const createRg = useEntityCreate('rackGroups');
  const recordAudit = useRecordAudit();
  const [open, setOpen] = useState<CatKind | null>(null);
  const [form] = Form.useForm();

  function submit() {
    form.validateFields().then((v) => {
      const slug = v.slug || slugify(v.name);
      if (open === 'manufacturer') {
        const id = `MFR-${Date.now().toString(36)}`;
        createMfr.mutate({ id, mfrId: id, name: v.name, slug, description: v.description, ...env() });
      } else if (open === 'role') {
        const id = `DROLE-${Date.now().toString(36)}`;
        createRole.mutate({ id, drId: id, name: v.name, slug, color: v.color || '#64748b', description: v.description, ...env() });
      } else if (open === 'platform') {
        const id = `PLAT-${Date.now().toString(36)}`;
        createPlat.mutate({ id, platId: id, name: v.name, slug, manufacturer: v.manufacturer, description: v.description, ...env() });
      } else if (open === 'invrole') {
        const id = `IIR-${Date.now().toString(36)}`;
        createIir.mutate({ id, iirId: id, name: v.name, slug, color: v.color || '#64748b', ...env() });
      } else if (open === 'sitegroup') {
        const id = `SG-${Date.now().toString(36)}`;
        createSg.mutate({ id, sgId: id, name: v.name, slug, ...env() });
      } else if (open === 'rackrole') {
        const id = `RR-${Date.now().toString(36)}`;
        createRr.mutate({ id, rrId: id, name: v.name, slug, color: v.color || '#64748b', ...env() });
      } else if (open === 'racktype') {
        const id = `RT-${Date.now().toString(36)}`;
        createRt.mutate({ id, rtypeId: id, manufacturer: v.manufacturer, model: v.name, uHeight: Number(v.uHeight) || 42, widthIn: ([19, 21, 23].includes(Number(v.widthIn)) ? Number(v.widthIn) : 19) as 19 | 21 | 23, formFactor: '4-post', ...env() });
      } else if (open === 'rackgroup') {
        const id = `RG-${Date.now().toString(36)}`;
        createRg.mutate({ id, rgId: id, name: v.name, slug, ...env() });
      }
      recordAudit('Catalog', v.name, 'created', `Created ${open} ${v.name}`);
      message.success('Created'); setOpen(null); form.resetFields();
    });
  }

  const mfrCols: TableColumnType<Manufacturer>[] = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Slug', dataIndex: 'slug', render: (s?: string) => s ? <span>{s}</span> : '—' },
  ];
  const roleCols: TableColumnType<DeviceRoleEntity>[] = [
    { title: 'Name', dataIndex: 'name', render: (n: string, r) => <VwChip color={r.color}>{n}</VwChip> },
    { title: 'Slug', dataIndex: 'slug', render: (s?: string) => s ? <span>{s}</span> : '—' },
  ];
  const platCols: TableColumnType<PlatformEntity>[] = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Manufacturer', dataIndex: 'manufacturer', render: (m?: string) => m ?? '—' },
    { title: 'Slug', dataIndex: 'slug', render: (s?: string) => s ? <span>{s}</span> : '—' },
  ];

  const head = (title: string, kind: CatKind, count: number) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
      <span>{title} <Text type="secondary">({count})</Text></span>
      <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(kind); form.resetFields(); }}>Add</Button>
    </div>
  );

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginTop: "var(--vw-space-md)" }}>
        <Col xs={12} md={6}><VwCard size="small" title={head('Manufacturers', 'manufacturer', manufacturers.length)} style={{ height: '100%' }}><Table<Manufacturer> rowKey="id" size="small" dataSource={manufacturers} columns={mfrCols} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }} /></VwCard></Col>
        <Col xs={12} md={6}><VwCard size="small" title={head('Device roles', 'role', roles.length)} style={{ height: '100%' }}><Table<DeviceRoleEntity> rowKey="id" size="small" dataSource={roles} columns={roleCols} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }} /></VwCard></Col>
        <Col xs={12} md={6}><VwCard size="small" title={head('Platforms', 'platform', platforms.length)} style={{ height: '100%' }}><Table<PlatformEntity> rowKey="id" size="small" dataSource={platforms} columns={platCols} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }} /></VwCard></Col>
        <Col xs={12} md={6}><VwCard size="small" title={head('Inventory roles', 'invrole', invRoles.length)} style={{ height: '100%' }}><Table<InventoryItemRole> rowKey="id" size="small" dataSource={invRoles} columns={[{ title: 'Name', dataIndex: 'name', render: (n: string, r) => <VwChip color={r.color}>{n}</VwChip> }]} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }} /></VwCard></Col>
      </Row>
      <Text type="secondary" style={{ display: 'block', marginTop: "var(--vw-space-lg)" }}>Rack &amp; site reference</Text>
      <Row gutter={[16, 16]} style={{ marginTop: "var(--vw-space-sm)" }}>
        <Col xs={12} md={6}><VwCard size="small" title={head('Rack roles', 'rackrole', rackRoles.length)} style={{ height: '100%' }}><Table<RackRole> rowKey="id" size="small" dataSource={rackRoles} columns={[{ title: 'Name', dataIndex: 'name', render: (n: string, r) => <VwChip color={r.color}>{n}</VwChip> }]} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }} /></VwCard></Col>
        <Col xs={12} md={6}><VwCard size="small" title={head('Rack types', 'racktype', rackTypes.length)} style={{ height: '100%' }}><Table<RackType> rowKey="id" size="small" dataSource={rackTypes} columns={[{ title: 'Model', dataIndex: 'model' }, { title: 'U', dataIndex: 'uHeight', align: 'right' }]} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }} /></VwCard></Col>
        <Col xs={12} md={6}><VwCard size="small" title={head('Rack groups', 'rackgroup', rackGroups.length)} style={{ height: '100%' }}><Table<RackGroup> rowKey="id" size="small" dataSource={rackGroups} columns={[{ title: 'Name', dataIndex: 'name' }]} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }} /></VwCard></Col>
        <Col xs={12} md={6}><VwCard size="small" title={head('Site groups', 'sitegroup', siteGroups.length)} style={{ height: '100%' }}><Table<SiteGroup> rowKey="id" size="small" dataSource={siteGroups} columns={[{ title: 'Name', dataIndex: 'name' }]} pagination={false} sticky={TABLE_STICKY} scroll={{ y: 320, x: 'max-content' }} /></VwCard></Col>
      </Row>

      <Modal title={`New ${open ?? ''}`} open={!!open} onOk={submit} okText="Create" onCancel={() => setOpen(null)}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="Enter name" /></Form.Item>
          <Form.Item name="slug" label="Slug"><Input placeholder="auto from name" /></Form.Item>
          {(open === 'role' || open === 'invrole' || open === 'rackrole') && <Form.Item name="color" label="Colour"><Input type="color" style={{ width: 80, padding: 2 }} /></Form.Item>}
          {open === 'platform' && <Form.Item name="manufacturer" label="Manufacturer"><Input placeholder="optional" /></Form.Item>}
          {open === 'racktype' && (<>
            <Form.Item name="manufacturer" label="Manufacturer"><Input placeholder="Vertiv" /></Form.Item>
            <Form.Item name="uHeight" label="Height (U)" initialValue={42}><Input placeholder="Enter height (U)" type="number" /></Form.Item>
            <Form.Item name="widthIn" label="Width (in)" initialValue={19}><Input placeholder="Enter width (in)" type="number" /></Form.Item>
          </>)}
          <Form.Item name="description" label="Description"><Input.TextArea placeholder="Enter description" autoSize={{ minRows: 2, maxRows: 3 }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
