/* Calendar tab: maintenance windows and freezes per site, a week or a month at a time.
   Freeze days are shaded; a window that touches the same devices or racks as another window at
   the same time is marked as a clash and listed under the grid. */
import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Select, Tooltip } from 'antd';
import { CalendarDays, ChevronLeft, ChevronRight, Snowflake, Swords, X } from 'lucide-react';
import type * as T from '../../../../mock/data/types';
import { Btn, Empty, Panel, Seg } from '../../../../ops/ui/kit';
import { DataTable } from '../../../../ops/ui/DataTable';
import { calendarClashes, fmtDay, fmtTime, siteLabel, startOfWeek, type CalEntry } from '../../lib/model';
import { Muted } from '../kit';

const DAY = 86400e3;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
const CLASS_BAR: Record<string, string> = { Standard: 'var(--vw-color-cyan-500)', Normal: 'var(--vw-color-blue-500)', Emergency: 'var(--vw-color-red-500)' };

export function CalendarTab({ entries, freezes, sites, rackOfDevice, focus }: { entries: CalEntry[]; freezes: T.ChangeFreeze[]; sites: T.DataCenter[]; rackOfDevice: Map<string, string>; focus?: string }) {
  const navigate = useNavigate();
  const focusEntry = focus ? entries.find(e => e.mwId === focus || e.changeId === focus) : undefined;
  const [view, setView] = useState<'Week' | 'Month'>('Week');
  const [anchor, setAnchor] = useState<Date>(() => focusEntry ? new Date(focusEntry.start) : new Date());
  const [site, setSite] = useState<string>('all');
  const [picked, setPicked] = useState<{ siteId: string; day: number } | null>(null);

  const days = useMemo(() => {
    if (view === 'Week') { const s = startOfWeek(anchor); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }
    const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const n = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => addDays(s, i));
  }, [view, anchor]);
  const r0 = days[0].getTime(), r1 = addDays(days[days.length - 1], 1).getTime();

  const inRange = useMemo(() => entries.filter(e => overlaps(new Date(e.start).getTime(), new Date(e.end).getTime() || new Date(e.start).getTime() + 1, r0, r1) && (site === 'all' || e.siteId === site)), [entries, r0, r1, site]);
  const frzInRange = useMemo(() => freezes.filter(f => overlaps(new Date(f.start).getTime(), new Date(f.end).getTime(), r0, r1) && (site === 'all' || !f.dataCenterId || f.dataCenterId === site)), [freezes, r0, r1, site]);
  const clashList = useMemo(() => calendarClashes(inRange, rackOfDevice), [inRange, rackOfDevice]);
  const clashOf = useMemo(() => { const m = new Map<string, CalEntry[]>(); for (const c of clashList) { m.set(c.a.key, [...(m.get(c.a.key) ?? []), c.b]); m.set(c.b.key, [...(m.get(c.b.key) ?? []), c.a]); } return m; }, [clashList]);

  const siteById = useMemo(() => new Map(sites.map(s => [s.id, s])), [sites]);
  const rowsSites = useMemo(() => {
    const ids = new Set<string>([...inRange.map(e => e.siteId ?? ''), ...frzInRange.filter(f => f.dataCenterId).map(f => f.dataCenterId!)]);
    if (site !== 'all') ids.add(site);
    return [...ids].sort((a, b) => siteLabel(siteById.get(a)).localeCompare(siteLabel(siteById.get(b))));
  }, [inRange, frzInRange, site, siteById]);

  /* A window shows on the day it starts; one that runs on for most of a later day shows there too, marked as continued. */
  const cellEntries = (siteId: string, d: Date) => {
    const t0 = d.getTime(), t1 = t0 + DAY;
    return inRange.filter(e => {
      if ((e.siteId ?? '') !== siteId) return false;
      const s = new Date(e.start).getTime(), en = new Date(e.end).getTime();
      return (s >= t0 && s < t1) || (s < t0 && en >= t0 + DAY / 2);
    });
  };
  const cellFreeze = (siteId: string, d: Date) => { const t0 = d.getTime(), t1 = t0 + DAY; return frzInRange.find(f => (!f.dataCenterId || f.dataCenterId === siteId) && overlaps(new Date(f.start).getTime(), new Date(f.end).getTime(), t0, t1)); };

  const step = (n: number) => { setPicked(null); setAnchor(a => view === 'Week' ? addDays(a, 7 * n) : new Date(a.getFullYear(), a.getMonth() + n, 1)); };
  const rangeLabel = view === 'Week' ? `${fmtDay(days[0].toISOString())} to ${fmtDay(days[6].toISOString())}` : anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cols = view === 'Week' ? `140px repeat(7, minmax(0, 1fr))` : `120px repeat(${days.length}, minmax(0, 1fr))`;
  const pickedEntries = picked ? cellEntries(picked.siteId, days[picked.day]) : [];

  return (
    <>
      <Panel title={rangeLabel} icon={CalendarDays} sub="Maintenance windows and freezes per site"
        actions={<>
          <Seg<'Week' | 'Month'> size="sm" value={view} onChange={v => { setView(v); setPicked(null); }} options={[{ id: 'Week', label: 'Week' }, { id: 'Month', label: 'Month' }]} />
          <Btn size="sm" icon={ChevronLeft} onClick={() => step(-1)} title={`Previous ${view.toLowerCase()}`} />
          <Btn size="sm" onClick={() => { setAnchor(new Date()); setPicked(null); }}>Today</Btn>
          <Btn size="sm" icon={ChevronRight} onClick={() => step(1)} title={`Next ${view.toLowerCase()}`} />
          <Select value={site} onChange={v => { setSite(v); setPicked(null); }} style={{ width: 170 }} aria-label="Site" showSearch optionFilterProp="label"
            options={[{ value: 'all', label: 'All sites' }, ...sites.map(s => ({ value: s.id, label: siteLabel(s) }))]} />
        </>}>
        {rowsSites.length === 0 ? (
          <Empty icon={CalendarDays} title={`No windows or freezes in this ${view.toLowerCase()}${site !== 'all' ? ` at ${siteLabel(siteById.get(site))}` : ''}`}>Use the arrows to look at another {view.toLowerCase()}.</Empty>
        ) : (
          <div role="grid" aria-label="Change calendar" style={{ display: 'grid', gridTemplateColumns: cols, border: '1px solid var(--vw-color-slate-200)', borderRadius: 'var(--vw-radius-sm)', overflow: 'hidden' }}>
            <div style={{ background: 'var(--vw-color-slate-50)', borderBottom: '1px solid var(--vw-color-slate-200)', padding: '6px 8px' }}><Muted size="xs">Site</Muted></div>
            {days.map(d => {
              const isToday = d.getTime() === today.getTime();
              return (
                <div key={d.getTime()} style={{ background: 'var(--vw-color-slate-50)', borderBottom: '1px solid var(--vw-color-slate-200)', borderLeft: '1px solid var(--vw-color-slate-200)', padding: view === 'Week' ? '6px 8px' : '6px 0', textAlign: view === 'Week' ? 'left' : 'center', minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--vw-font-label-xs)', color: isToday ? 'var(--vw-color-blue-700)' : 'var(--vw-color-slate-600)', fontWeight: isToday ? 600 : 400 }}>
                    {view === 'Week' ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : <>{d.toLocaleDateString('en-GB', { weekday: 'narrow' })}<br />{d.getDate()}</>}
                  </span>
                </div>
              );
            })}
            {rowsSites.map(sid => (
              <Fragment key={sid}>
                <div style={{ borderBottom: '1px solid var(--vw-color-slate-100)', padding: '8px', fontSize: 'var(--vw-font-label-sm)', color: 'var(--vw-color-slate-900)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={siteById.get(sid)?.name}>
                  {sid ? siteLabel(siteById.get(sid)) : 'No site'}
                </div>
                {days.map((d, di) => {
                  const list = cellEntries(sid, d);
                  const frz = cellFreeze(sid, d);
                  const clash = list.some(e => clashOf.has(e.key));
                  const bg = frz ? 'var(--vw-color-amber-50)' : undefined;
                  if (view === 'Month') {
                    const sel = picked?.siteId === sid && picked.day === di;
                    return (
                      <div key={di} role="gridcell" tabIndex={list.length ? 0 : -1} onClick={() => list.length && setPicked(sel ? null : { siteId: sid, day: di })}
                        onKeyDown={e => { if (e.key === 'Enter' && list.length) setPicked(sel ? null : { siteId: sid, day: di }); }}
                        title={[frz && `Freeze: ${frz.name}`, list.length && `${list.length} window(s)`, clash && 'Clash'].filter(Boolean).join(' · ') || undefined}
                        style={{ background: bg, borderLeft: '1px solid var(--vw-color-slate-200)', borderBottom: '1px solid var(--vw-color-slate-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 34, cursor: list.length ? 'pointer' : undefined, outline: sel ? '2px solid var(--vw-color-blue-500)' : undefined, outlineOffset: -2 }}>
                        {list.length > 0 && (
                          <span style={{ minWidth: 20, height: 20, padding: '0 4px', borderRadius: 'var(--vw-radius-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--vw-font-label-xs)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', background: clash ? 'var(--vw-color-red-100)' : 'var(--vw-color-slate-100)', color: clash ? 'var(--vw-color-red-700)' : 'var(--vw-color-slate-800)', border: clash ? '1px solid var(--vw-color-red-400)' : undefined }}>{list.length}</span>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={di} role="gridcell" style={{ background: bg, borderLeft: '1px solid var(--vw-color-slate-200)', borderBottom: '1px solid var(--vw-color-slate-100)', padding: 6, minWidth: 0, minHeight: 56, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {frz && <span style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-amber-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${frz.name}: ${frz.reason}`}>Freeze · {frz.name}</span>}
                      {list.map(e => <EntryBlock key={e.key} e={e} dayStart={d.getTime()} clashWith={clashOf.get(e.key)} focused={focusEntry?.key === e.key} onOpen={() => e.changeId && navigate(`/changes/${e.changeId}`)} />)}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
          <Muted size="xs"><Swatch color="var(--vw-color-amber-50)" border /> Freeze: only emergency changes may proceed</Muted>
          <Muted size="xs"><Swatch color="var(--vw-color-red-100)" border /> Clash: two windows touch the same devices or racks at the same time</Muted>
          <Muted size="xs">Bar colour: <Swatch color={CLASS_BAR.Standard} /> standard <Swatch color={CLASS_BAR.Normal} /> normal <Swatch color={CLASS_BAR.Emergency} /> emergency</Muted>
          <Muted size="xs">Times are local.</Muted>
        </div>
      </Panel>

      {view === 'Month' && picked && (
        <Panel title={`${siteLabel(siteById.get(picked.siteId))} · ${fmtDay(days[picked.day].toISOString())}`} icon={CalendarDays} count={pickedEntries.length}
          actions={<Btn size="sm" variant="ghost" icon={X} onClick={() => setPicked(null)}>Close</Btn>}>
          <div className="col" style={{ gap: 6 }}>{pickedEntries.map(e => <EntryBlock key={e.key} e={e} wide clashWith={clashOf.get(e.key)} onOpen={() => e.changeId && navigate(`/changes/${e.changeId}`)} />)}</div>
        </Panel>
      )}

      <div className="grid g-2-1">
        <Panel title="Clashes in view" icon={Swords} count={clashList.length} flush>
          <DataTable compact rows={clashList.map(c => ({ ...c, id: `${c.a.key}-${c.b.key}` }))} pageSize={25}
            empty={<Empty icon={Swords} title="No clashes">No two windows in this {view.toLowerCase()} touch the same equipment at the same time.</Empty>}
            cols={[
              { key: 'when', header: 'When', render: c => <span className="num">{fmtDay(c.b.start)} {fmtTime(c.b.start)}</span> },
              { key: 'site', header: 'Site', render: c => siteLabel(siteById.get(c.a.siteId ?? '')) },
              { key: 'a', header: 'Window', render: c => (c.a.changeId ? <Link className="ent-link mono" to={`/changes/${c.a.changeId}`}>{c.a.label}</Link> : c.a.label) },
              { key: 'b', header: 'Clashes with', render: c => (c.b.changeId ? <Link className="ent-link mono" to={`/changes/${c.b.changeId}`}>{c.b.label}</Link> : c.b.label) },
              { key: 'shared', header: 'Shared equipment', wrap: true, render: c => `${c.shared.slice(0, 4).join(', ')}${c.shared.length > 4 ? ` and ${c.shared.length - 4} more` : ''}` },
            ]} />
        </Panel>
        <Panel title="Freezes in view" icon={Snowflake} count={frzInRange.length}>
          {frzInRange.length === 0 ? <Empty icon={Snowflake} title={`No freeze in this ${view.toLowerCase()}`} /> : (
            <div className="col" style={{ gap: 0 }}>
              {frzInRange.map((f, i) => (
                <div key={f.id} className="cell-2" style={{ padding: '6px 0', borderTop: i ? '1px solid var(--vw-color-slate-100)' : undefined }}>
                  <span className="strong">{f.name}</span>
                  <Muted size="xs">{f.dataCenterId ? siteLabel(siteById.get(f.dataCenterId)) : 'All sites'} · {fmtDay(f.start)} to {fmtDay(f.end)} · {f.allows === 'None' ? 'no changes' : 'emergency only'}</Muted>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function Swatch({ color, border }: { color: string; border?: boolean }) {
  return <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color, border: border ? '1px solid var(--vw-color-slate-300)' : undefined, verticalAlign: -1, margin: '0 2px' }} />;
}

function EntryBlock({ e, clashWith, focused, wide, dayStart, onOpen }: { e: CalEntry; clashWith?: CalEntry[]; focused?: boolean; wide?: boolean; dayStart?: number; onOpen: () => void }) {
  const clash = !!clashWith?.length;
  const continued = dayStart !== undefined && new Date(e.start).getTime() < dayStart;
  const body = (
    <div onClick={onOpen} role={e.changeId ? 'link' : undefined} tabIndex={e.changeId ? 0 : undefined} onKeyDown={k => { if (k.key === 'Enter') onOpen(); }}
      style={{
        borderLeft: `3px solid ${CLASS_BAR[e.cls ?? ''] ?? 'var(--vw-color-slate-400)'}`, background: clash ? 'var(--vw-color-red-50)' : 'var(--vw-color-white)',
        outline: clash ? '1px solid var(--vw-color-red-300)' : focused ? '2px solid var(--vw-color-blue-500)' : '1px solid var(--vw-color-slate-200)', outlineOffset: -1,
        borderRadius: 'var(--vw-radius-sm)', padding: '3px 6px', cursor: e.changeId ? 'pointer' : 'default', minWidth: 0,
        display: wide ? 'flex' : 'block', gap: 12, alignItems: 'baseline',
      }}>
      <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-900)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {continued ? 'cont.' : fmtTime(e.start)} {e.label}{clash && <span style={{ color: 'var(--vw-color-red-700)' }}> · clash</span>}
      </div>
      <div style={{ fontSize: 'var(--vw-font-label-xs)', color: 'var(--vw-color-slate-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}{wide ? ` · ${e.status}` : ''}</div>
    </div>
  );
  return (
    <Tooltip title={<div>{e.label}: {e.title}<br />{fmtDay(e.start)} {fmtTime(e.start)} to {fmtTime(e.end)} · {e.status}{clash && <><br />Clashes with {clashWith!.map(c => c.label).join(', ')}</>}</div>}>
      {body}
    </Tooltip>
  );
}
