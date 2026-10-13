/* The Operate shell inside DCOS: renders the ported screens plus the palette, Sentinel and alarm
   drawers they open. The slim top bar was removed — DCOS's own sidebar and header are the only chrome. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DetailCrumbs } from '../../core/layout/DetailBreadcrumbs';
import { useIsDetailRoute } from '../../core/layout/useIsDetailRoute';
import * as I from 'lucide-react';
import { clockNow, getAlerts, resetDemo, useQuery } from '../api';
import { fmtAgo } from '../lib/format';
import { Drawer } from '../ui/kit';
import { SevDot } from '../ui/status';
import { PageCtx, type PageMeta } from './page';
import { Palette } from './Palette';
import { Sentinel } from './Sentinel';
import '../styles/index.css';

export function OpsShell() {
  const loc = useLocation();
  const isDetail = useIsDetailRoute();
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
        {isDetail && <div className="page" style={{ paddingBottom: 0, paddingTop: 14 }}><DetailCrumbs crumbs={meta.crumbs} fallback="/operate/command" /></div>}
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
