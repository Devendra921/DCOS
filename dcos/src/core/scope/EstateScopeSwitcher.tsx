import { useState, type ReactNode } from 'react';
import { Dropdown } from 'antd';
import { Building2, Check, ChevronDown, Cloud, Cpu, Globe, Landmark, Layers, MapPin, Network } from 'lucide-react';
import { PERSONAS, currencySymbolOf, getEstateScope, getScopeOptions, getStartupInfo, setEstateScope, type EstateScope } from '../../mock/db';

/**
 * Persona and geography: which part of the estate the app shows. The same two choices the URL takes
 * (?persona=neocloud&geo=us). Changing one rebuilds the store for it and reloads, so every page, count and
 * chart sees the same scoped data.
 */
const PERSONA_ICON: Record<string, ReactNode> = {
  all: <Layers size={16} />, network: <Network size={16} />, colocation: <Building2 size={16} />,
  cloud: <Cloud size={16} />, enterprise: <Landmark size={16} />, neocloud: <Cpu size={16} />,
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

interface Row { id: string; label: string; detail: string; icon: ReactNode }

export function EstateScopeSwitcher() {
  const scope = getEstateScope();
  const { personas, geos } = getScopeOptions();
  if (!personas.length && !geos.length) return null;
  const sites = personas.reduce((a, p) => a + p.count, 0);
  const personaLabel = scope.persona === 'all' ? 'All personas' : PERSONAS.find((p) => p.id === scope.persona)?.label ?? scope.persona;
  const geoLabel = scope.geo === 'all' ? 'All geographies' : geos.find((g) => g.id === scope.geo)?.label ?? scope.geo;
  const empty = (scope.persona !== 'all' || scope.geo !== 'all') && getStartupInfo()?.sites === 0;
  const pick = (next: Partial<EstateScope>) => { const s = { ...scope, ...next }; if (s.persona !== scope.persona || s.geo !== scope.geo) setEstateScope(s); };

  const personaRows: Row[] = [
    { id: 'all', label: 'All personas', detail: `Every kind of data center · ${plural(sites, 'datacenter')}`, icon: PERSONA_ICON.all },
    ...personas.map((p) => ({ id: p.id, label: p.label, detail: PERSONAS.find((x) => x.id === p.id)?.tagline ?? '', icon: PERSONA_ICON[p.id] })),
  ];
  const geoRows: Row[] = [
    { id: 'all', label: 'All geographies', detail: `${plural(sites, 'datacenter')} · every country`, icon: <Globe size={16} /> },
    ...geos.map((g) => ({ id: g.id, label: g.label, detail: `${plural(g.count, 'datacenter')} across ${plural(g.campuses ?? 0, 'campus').replace('campuss', 'campuses')}${currencySymbolOf(g.id) ? ` · ${currencySymbolOf(g.id)}` : ''}`, icon: <MapPin size={16} /> })),
  ];

  return (
    <div className="scope-switcher" role="group" aria-label="Estate scope">
      <ScopeCard icon={<Cpu size={16} />} label="Persona" value={personaLabel} selected={scope.persona}
        title="Model the estate as" rows={personaRows} foot="Only the sites of this kind of data center, with their equipment, alarms, customers and work."
        onPick={(id) => pick({ persona: id as EstateScope['persona'] })} />
      <ScopeCard icon={<Globe size={16} />} label="Geography" value={geoLabel} selected={scope.geo}
        title="Model the estate in" rows={geoRows} foot="Only the sites in this country, with their equipment, alarms, customers and work."
        onPick={(id) => pick({ geo: id })} />
      {empty && <span className="scope-empty" role="status">No sites in this scope</span>}
    </div>
  );
}

function ScopeCard({ icon, label, value, selected, title, rows, foot, onPick }: {
  icon: ReactNode; label: string; value: string; selected: string; title: string; rows: Row[]; foot: string; onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dropdown trigger={['click']} placement="bottomLeft" open={open} onOpenChange={setOpen} overlayClassName="scope-menu"
      popupRender={() => (
        <div className="scope-pop" role="listbox" aria-label={title}>
          <div className="scope-pop-title">{title}</div>
          {rows.map((r) => (
            <button key={r.id} type="button" role="option" aria-selected={r.id === selected} className={`scope-pop-row${r.id === selected ? ' is-on' : ''}`}
              onClick={() => { setOpen(false); onPick(r.id); }}>
              <span className="scope-pop-ico">{r.icon}</span>
              <span className="scope-pop-txt"><b>{r.label}</b><small>{r.detail}</small></span>
              {r.id === selected && <Check size={16} className="scope-pop-check" />}
            </button>
          ))}
          <div className="scope-pop-foot">{foot}</div>
        </div>
      )}>
      <button type="button" className="scope-card" aria-label={`${label}: ${value}`} title={`${label}: ${value}`}>
        <span className="scope-ico">{icon}</span>
        <span className="scope-txt"><small>{label}</small><b>{value}</b></span>
        <ChevronDown size={15} className="scope-chev" />
      </button>
    </Dropdown>
  );
}
