import { useState } from 'react';
import { App, Form, Input, Modal } from 'antd';
import { Inbox, Plus } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Empty, Panel } from '../../../ops/ui/kit';
import { DataTable, type Col } from '../../../ops/ui/DataTable';
import { useEntityList, useEntityCreate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import type { Manufacturer, DeviceRoleEntity, PlatformEntity, InventoryItemRole, SiteGroup, RackRole, RackType, RackGroup } from '../../../mock/data/types';
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

  const empty = <Empty icon={Inbox} title="None yet" />;
  const slug = (s?: string) => s ? <span className="mono">{s}</span> : <span className="vw-label">—</span>;
  const colored = (n: string, color?: string) => <Chip tone="neutral"><i className="chip-dot" style={{ background: color }} />{n}</Chip>;
  const name = <T extends { name: string }>(): Col<T> => ({ key: 'name', header: 'Name', sort: (r) => r.name, render: (r) => <span className="vw-card-activity-label">{r.name}</span> });

  const mfrCols: Col<Manufacturer>[] = [name<Manufacturer>(), { key: 'slug', header: 'Slug', render: (r) => slug(r.slug) }];
  const roleCols: Col<DeviceRoleEntity>[] = [
    { key: 'name', header: 'Name', sort: (r) => r.name, render: (r) => colored(r.name, r.color) },
    { key: 'slug', header: 'Slug', render: (r) => slug(r.slug) },
  ];
  const platCols: Col<PlatformEntity>[] = [
    { key: 'name', header: 'Name', sort: (r) => r.name, render: (r) => <span className="cell-2"><span className="vw-card-activity-label">{r.name}</span><small>{r.manufacturer ?? '—'}</small></span> },
    { key: 'slug', header: 'Slug', render: (r) => slug(r.slug) },
  ];
  const invRoleCols: Col<InventoryItemRole>[] = [{ key: 'name', header: 'Name', sort: (r) => r.name, render: (r) => colored(r.name, r.color) }];
  const rackRoleCols: Col<RackRole>[] = [{ key: 'name', header: 'Name', sort: (r) => r.name, render: (r) => colored(r.name, r.color) }];
  const rackTypeCols: Col<RackType>[] = [
    { key: 'model', header: 'Model', sort: (r) => r.model, render: (r) => <span className="vw-card-activity-label">{r.model}</span> },
    { key: 'u', header: 'U', align: 'right', sort: (r) => r.uHeight, render: (r) => <span className="num">{r.uHeight}</span> },
  ];

  const add = (kind: CatKind) => <Btn variant="filled" size="xs" icon={Plus} onClick={() => { setOpen(kind); form.resetFields(); }}>Add</Btn>;
  const panel = <T extends { id: string }>(title: string, kind: CatKind, rows: T[], cols: Col<T>[]) => (
    <Panel title={title} count={rows.length} actions={add(kind)} flush>
      <DataTable rows={rows} cols={cols} compact maxHeight={320} pageSize={1000} empty={empty} />
    </Panel>
  );

  return (
    <OpsPage title="Catalog" description="Reference data used across DCIM — manufacturers, roles, platforms and rack and site groupings">
      <div className="grid g-4">
        {panel('Manufacturers', 'manufacturer', manufacturers, mfrCols)}
        {panel('Device roles', 'role', roles, roleCols)}
        {panel('Platforms', 'platform', platforms, platCols)}
        {panel('Inventory roles', 'invrole', invRoles, invRoleCols)}
      </div>
      <span className="vw-label">Rack &amp; site reference</span>
      <div className="grid g-4">
        {panel('Rack roles', 'rackrole', rackRoles, rackRoleCols)}
        {panel('Rack types', 'racktype', rackTypes, rackTypeCols)}
        {panel('Rack groups', 'rackgroup', rackGroups, [name<RackGroup>()])}
        {panel('Site groups', 'sitegroup', siteGroups, [name<SiteGroup>()])}
      </div>

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
    </OpsPage>
  );
}
