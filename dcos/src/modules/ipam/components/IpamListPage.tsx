import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Btn } from '../../../ops/ui/kit';
import type { TableColumnType } from 'antd';
import type { FilterCriteria } from '../../../mock/db/store';
import { EntityListPage } from '../../../shared/components/EntityListPage';
import type { TabConfig } from '../../../shared/components/EntityListPage';
import { EntityFormModal } from './EntityFormModal';
import type { FieldSpec } from './EntityFormModal';

export interface IpamListPageProps<T extends Record<string, any>> {
  title: string;
  entity: string;
  label: string;          // singular, for buttons + audit, e.g. 'RIR'
  idField: string;        // e.g. 'rirId'
  idPrefix: string;       // e.g. 'RIR'
  columns: TableColumnType<T>[];
  fields: FieldSpec[];
  searchPlaceholder?: string;
  tabs?: TabConfig[];
  defaultFilters?: FilterCriteria[];
  transform?: (values: Record<string, unknown>, isEdit: boolean) => Record<string, unknown>;
  toForm?: (record: T) => Record<string, unknown>;
  initialValues?: Record<string, unknown>;
  onRowClick?: (record: T) => void;
  nameField?: string;
  /** when false, no create/edit affordances are shown (read-only) */
  editable?: boolean;
}

/** EntityListPage + schema-driven create/edit modal + per-row Edit action. */
export function IpamListPage<T extends Record<string, any>>(props: IpamListPageProps<T>) {
  const { title, entity, label, idField, idPrefix, columns, fields, searchPlaceholder, tabs, defaultFilters, transform, toForm, initialValues, onRowClick, nameField, editable = true } = props;
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<T | null>(null);

  return (
    <div>
      <EntityListPage<T>
        title={title}
        entityType={entity}
        columns={columns}
        searchPlaceholder={searchPlaceholder}
        tabs={tabs}
        defaultFilters={defaultFilters}
        onRowClick={onRowClick}
        createButtonLabel={editable ? `New ${label}` : undefined}
        onCreateClick={editable ? () => { setRecord(null); setOpen(true); } : undefined}
        rowActions={editable ? (r) => (
          <Btn size="xs" variant="ghost" icon={Pencil} onClick={(e) => { e.stopPropagation(); setRecord(r); setOpen(true); }}>Edit</Btn>
        ) : undefined}
      />
      {editable && (
        <EntityFormModal<T>
          open={open}
          onClose={() => setOpen(false)}
          entity={entity}
          label={label}
          idField={idField}
          idPrefix={idPrefix}
          fields={fields}
          record={record}
          initialValues={initialValues}
          transform={transform}
          toForm={toForm}
          nameField={nameField}
        />
      )}
    </div>
  );
}

export default IpamListPage;
