import { Link, useLocation, useMatches, useNavigate } from 'react-router-dom';
import { ArrowLeft, CaretRight } from '@phosphor-icons/react';
import { menuItems, type MenuItem } from './menuConfig';

export interface Crumb { label: string; to?: string }

const SEG: Record<string, string> = { dc: 'Data center', racks: 'Racks', hall: 'Halls', devices: 'Devices', 'device-types': 'Device types', 'work-orders': 'Work orders', nms: 'Network management', ipam: 'IP & Network' };
const title = (s: string) => SEG[s] ?? decodeURIComponent(s).replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

function flatten(items: MenuItem[], group?: string): Array<{ item: MenuItem; group?: string }> {
  return items.flatMap((i) => i.children ? flatten(i.children, i.label) : [{ item: i, group }]);
}
const FLAT = flatten(menuItems);

/** Back button + trail: Group › Section › … › current. Renders nothing on list/tab pages. */
export function DetailCrumbs({ crumbs, fallback }: { crumbs: Crumb[]; fallback?: string }) {
  const navigate = useNavigate();
  if (!crumbs.length) return null;
  const parent = [...crumbs].reverse().find((c) => c.to)?.to ?? fallback ?? '/';
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1); else navigate(parent);
  };
  return (
    <nav className="dcos-crumbs" aria-label="Breadcrumb">
      <button type="button" className="dcos-crumbs-back" onClick={goBack} aria-label="Go back" title="Back">
        <ArrowLeft size={16} />
      </button>
      <ol>
        {crumbs.map((c, i) => (
          <li key={i} className={i === crumbs.length - 1 ? 'is-current' : undefined}>
            {i > 0 && <CaretRight size={12} className="dcos-crumbs-sep" aria-hidden />}
            {c.to && i < crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Generic breadcrumbs for DCOS (non-Operate) detail pages, built from the menu and the URL. */
export function DetailBreadcrumbs() {
  const { pathname } = useLocation();
  const matches = useMatches();
  const last = matches[matches.length - 1];
  const isOps = matches.some((m) => (m.handle as { ops?: boolean } | undefined)?.ops);
  if (isOps || !last || Object.keys(last.params ?? {}).length === 0) return null;

  const best = FLAT.filter(({ item }) => item.path && (pathname === item.path || pathname.startsWith(item.path + '/')))
    .sort((a, b) => b.item.path!.length - a.item.path!.length)[0];
  const crumbs: Crumb[] = [];
  let rest = pathname;
  if (best) {
    if (best.group) crumbs.push({ label: best.group });
    crumbs.push({ label: best.item.label, to: best.item.path });
    rest = pathname.slice(best.item.path!.length);
  }
  const segs = rest.split('/').filter(Boolean);
  segs.forEach((seg, i) => {
    const isLast = i === segs.length - 1;
    // a static segment links to its own path only when it is a real list route; ids and the last item never do
    crumbs.push({ label: isLast ? decodeURIComponent(seg) : title(seg) });
  });
  return <DetailCrumbs crumbs={crumbs} fallback={best?.item.path} />;
}
