/* The Operate shell inside DCOS: a slim bar (breadcrumbs · persona · search · Opstral · alarms)
   above the ported screens, plus the drawers they open. DCOS's own sidebar and header stay. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as I from 'lucide-react';
import { OpstralBtn } from '../ui/OpstralMark';
import { clockNow, getAlerts, resetDemo, useQuery, CURRENT_USER, PERSONAS, setPersona, usePersona } from '../api';
import type { Persona } from '../api/types';
import { fmtAgo, fmtDow, fmtShortDate, fmtTime } from '../lib/format';
import { Drawer } from '../ui/kit';
import { SevDot } from '../ui/status';
import { PageCtx, type PageMeta } from './page';
import { Palette } from './Palette';
import { Sentinel } from './Sentinel';
import '../styles/index.css';

const PERSONA_ICON: Record<Persona, I.LucideIcon> = { network: I.Network, colocation: I.Building2, cloud: I.Cloud, enterprise: I.Landmark };

/* Persona = vocabulary and emphasis only; the estate is the DCOS estate. */
function PersonaSwitch() {
  const { persona, def } = usePersona();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', f); window.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); window.removeEventListener('keydown', k); };
  }, [open]);
  const Icon = PERSONA_ICON[persona];
  return (
    <div ref={ref} className="persona" data-persona={persona}>
      <button type="button" className={`persona-btn${open ? ' is-open' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} title="Persona — changes vocabulary and emphasis, not the data">
        <span className="persona-ic"><Icon size={15} /></span>
        <span className="persona-txt"><small>Persona</small><b>{def.label}</b></span>
        <I.ChevronDown size={14} className="persona-chev" />
      </button>
      {open && (
        <div className="persona-menu" role="listbox" aria-label="Persona">
          <div className="persona-menu-h">Read the estate as</div>
          {PERSONAS.map(p => { const PI = PERSONA_ICON[p.id]; return (
            <button key={p.id} type="button" role="option" aria-selected={p.id === persona} className={`persona-opt${p.id === persona ? ' is-on' : ''}`} onClick={() => { setOpen(false); void setPersona(p.id); }}>
              <span className="persona-ic"><PI size={16} /></span>
              <span className="persona-opt-txt"><b>{p.label}</b><span>{p.tagline}</span></span>
              {p.id === persona && <I.Check size={15} className="persona-check" />}
            </button>
          ); })}
          <div className="persona-menu-f">Same sites, racks and services · the words and the default views change</div>
        </div>
      )}
    </div>
  );
}

export function OpsShell() {
  const loc = useLocation();
  const nav = useNavigate();
  const [meta, setMeta] = useState<PageMeta>({ crumbs: [], ctx: {} });
  const [palette, setPalette] = useState(false);
  const [bell, setBell] = useState(false);
  const [sentinel, setSentinel] = useState<{ open: boolean; q?: string }>({ open: false });
  const { data: hot } = useQuery(() => getAlerts({ state: 'open' }), []);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const openSentinel = useCallback((q?: string) => setSentinel({ open: true, q }), []);
  const ctxValue = useMemo(() => ({ set: setMeta, openSentinel }), [openSentinel]);
  const now = clockNow();
  const crit = (hot ?? []).filter(a => a.severity === 'critical' || a.severity === 'major').slice(0, 30);

  return (
    <PageCtx.Provider value={ctxValue}>
      <div className="ops-root main">
        <header className="topbar ops-bar">
          <nav className="topbar-crumbs" aria-label="Breadcrumb">
            {meta.crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: 6 }}>
                {i > 0 && <I.ChevronRight size={14} className="faint" />}
                {c.to && i < meta.crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <b>{c.label}</b>}
              </span>
            ))}
          </nav>
          <div className="topbar-spacer" />
          <PersonaSwitch />
          <button type="button" className="topbar-search" onClick={() => setPalette(true)}><I.Search size={15} /><span className="ellipsis">Search estate…</span></button>
          <OpstralBtn onClick={() => openSentinel()} />
          <span className="topbar-clock" title="Operations clock"><span className="live-dot" />{fmtDow(now)} {fmtShortDate(now)} · {fmtTime(now)}</span>
          <button type="button" className="nst-icon-btn topbar-icon" title="Critical & major alarms" onClick={() => setBell(true)}><I.Bell size={17} />{crit.length > 0 && <span className="count">{crit.length > 9 ? '9+' : crit.length}</span>}</button>
          <span className="avatar-me" title={`${CURRENT_USER} · Global operations`}>JV</span>
        </header>
        <Outlet />
        <Palette open={palette} onClose={() => setPalette(false)} />
        <Sentinel open={sentinel.open} initial={sentinel.q} ctx={meta.ctx} onClose={() => setSentinel({ open: false })} />
        <Drawer open={bell} onClose={() => setBell(false)} title="Critical & major alarms" sub="Newest first · click to open the device or site" width={460}>
          {crit.map(a => (
            <button key={a.id} type="button" onClick={() => { setBell(false); nav(a.neId ? `/ne/${a.neId}?tab=alerts` : `/datacenters/${a.dcId}?tab=attention`); }} className="card bell-row">
              <SevDot s={a.severity} />
              <span style={{ flex: 1, minWidth: 0 }}><b className="strong" style={{ fontSize: 13, display: 'block' }}>{a.title}</b><span className="muted" style={{ fontSize: 12 }}>{a.neId ?? a.dcId}{a.ifName ? ` · ${a.ifName}` : ''} · {a.code}</span></span>
              <span className="faint num" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{fmtAgo(a.start, now)}</span>
            </button>
          ))}
          <Link to="/alerts" className="panel-link" onClick={() => setBell(false)}>Open alerts console<I.ChevronRight size={14} /></Link>
          <button type="button" className="panel-link" style={{ marginTop: 6 }} onClick={() => { void resetDemo(); setBell(false); }}><I.RotateCcw size={13} />Rebuild operate model</button>
        </Drawer>
      </div>
    </PageCtx.Provider>
  );
}
export default OpsShell;
