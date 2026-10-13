import { createContext, useContext, useState, type ReactNode } from 'react';
import { Select } from 'antd';
import { useEntityList } from '../../shared/hooks/useEntityCRUD';
import type { FilterCriteria } from '../../mock/db';
import type { DataCenter } from '../../mock/data/types';
import { dcTypeName } from '../../mock/data/dcTypes';

interface DcScopeValue { dcId: string; setDcId: (id: string) => void; }
const Ctx = createContext<DcScopeValue>({ dcId: 'all', setDcId: () => {} });

export function DcScopeProvider({ children }: { children: ReactNode }) {
  const [dcId, setDcId] = useState('all');
  return <Ctx.Provider value={{ dcId, setDcId }}>{children}</Ctx.Provider>;
}

export const useDcScope = () => useContext(Ctx);

/** Returns a FilterCriteria[] to spread into useEntityList for DC-scoped entities. */
export function useDcFilter(field = 'dataCenterId'): FilterCriteria[] {
  const { dcId } = useDcScope();
  return dcId === 'all' ? [] : [{ field, operator: 'eq', value: dcId }];
}

/** Data-center scope selector — always rendered inline in a page's own title row (never in the app-level header, so it survives the header being hidden in embedded/production builds). */
export function DcScopeSelect() {
  const { dcId, setDcId } = useDcScope();
  const dcs = (useEntityList('dataCenters', { pageSize: 100 }).data?.data ?? []) as unknown as DataCenter[];
  return (
    <Select placeholder="Select data center"
      className="dc-scope-select"
      value={dcId}
      onChange={setDcId}
      style={{ minWidth: 210 }}
      popupMatchSelectWidth={false}
      options={[{ value: 'all', label: `All data centers (${dcs.length})` }, ...dcs.map((d) => ({ value: d.id, label: d.dcTypeKey ? `${d.name} · ${dcTypeName(d.dcTypeKey)} · ${d.tier}` : `${d.name} · ${d.tier}` }))]}
    />
  );
}

/** Alias kept for call-site clarity at page-title usages — identical to `DcScopeSelect`. */
export const PageDcScopeSelect = DcScopeSelect;
