import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Search, Server } from 'lucide-react';
import { Layout, Dropdown, Select, Badge, Typography, Space, Tooltip, ConfigProvider, Popover, Empty } from 'antd';
import { VwButton as Button } from '../../shared/components/vw/VwButton';

import { MenuOutlined, BellOutlined, LogoutOutlined, SwapOutlined, SearchOutlined, EyeOutlined, CheckOutlined, AuditOutlined, ReadOutlined, InfoCircleOutlined } from '../../shared/icons';
import { useAuth } from '../auth/AuthContext';
import { menuItems, type MenuItem, INT_DISABLED_LIVE } from './menuConfig';
import { getShowChrome } from './chromeMode';
import { DetailBreadcrumbs } from './DetailBreadcrumbs';
import { useIsDetailRoute } from './useIsDetailRoute';
import './detail-ui.css';
import { CommandPalette, type CommandItem } from '../../shared/components/ux';
import { usePerspective, adaptMenu, PerspectiveSwitcher } from '../perspective';
import CopilotFab from '../../app/CopilotFab';
import { useHelpRail, HelpRailPanel, HelpRailModal } from '../docs/HelpRail';
import { SynopsisProvider } from '../docs/SynopsisContext';
import { db } from '../../mock/db';
import { useEntityList } from '../../shared/hooks/useEntityCRUD';
import { DC_TYPE_CATALOG, dcTypeProfile } from '../../mock/data/dcTypes';
import type { DataCenter } from '../../mock/data/types';
import { useBalancedRows } from './useBalancedRows';
import { useTruncationTitles } from './useTruncationTitles';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// Small inline badge marking a menu item as a screen onto a pre-built module.
// The system of record lives outside the rollout platform.
// Sized so it reads clearly against the light Sider on both parent groups
// (e.g. Field Operations) and leaf items (e.g. Incident Register).
function currentCrumb(menu: MenuItem[], key: string | undefined): { label: string; group: string } {
  for (const top of menu) {
    if (top.key === key) return { label: top.label, group: '' };
    const child = top.children?.find((c) => c.key === key);
    if (child) return { label: child.label, group: top.label };
  }
  return { label: 'DCOS', group: '' };
}

/** Ideation rail: top-level leaves sit under "Overview", every area becomes a labelled group. */
function railGroups(items: MenuItem[]): Array<{ key: string; label: string; parked: boolean; items: MenuItem[] }> {
  const groups: Array<{ key: string; label: string; parked: boolean; items: MenuItem[] }> = [];
  const leaves = items.filter((i) => !i.children?.length);
  if (leaves.length) groups.push({ key: 'overview', label: 'Overview', parked: false, items: leaves });
  for (const i of items) if (i.children?.length) groups.push({ key: i.key, label: i.label, parked: !INT_DISABLED_LIVE && i.intDisabled === true, items: i.children });
  return groups;
}

function findPathByKey(items: MenuItem[], key: string): string | undefined {
  for (const item of items) {
    if (item.key === key && item.path) return item.path;
    if (item.children) {
      const found = findPathByKey(item.children, key);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * True if the given key is `intDisabled` itself or is nested under any
 * ancestor that is. Used to short-circuit navigation for parked modules.
 */
function isKeyIntDisabled(items: MenuItem[], key: string, ancestorDisabled = false): boolean {
  for (const item of items) {
    const here = ancestorDisabled || item.intDisabled === true;
    if (item.key === key) return here;
    if (item.children) {
      const found = isKeyIntDisabled(item.children, key, here);
      if (found) return true;
      // Important: we must keep looking even if this subtree returned false,
      // since the key might live in a sibling branch.
    }
  }
  return false;
}

function findExactKeyByPath(items: MenuItem[], path: string): string[] {
  for (const item of items) {
    if (item.path === path) return [item.key];
    if (item.children) {
      const found = findExactKeyByPath(item.children, path);
      if (found.length) return [item.key, ...found];
    }
  }
  return [];
}

/** Exact path first; otherwise the menu entry with the longest path that prefixes this one
 *  (so /planning/plans/PLN-0001 or /planning/templates highlights Planner). */
function findKeyByPath(items: MenuItem[], path: string): string[] {
  const exact = findExactKeyByPath(items, path);
  if (exact.length) return exact;
  let best: { keys: string[]; len: number } = { keys: [], len: 0 };
  const walk = (list: MenuItem[], trail: string[]) => {
    for (const item of list) {
      const keys = [...trail, item.key];
      if (item.path && item.path !== '/' && path.startsWith(`${item.path}/`) && item.path.length > best.len) best = { keys, len: item.path.length };
      if (item.children) walk(item.children, keys);
    }
  };
  walk(items, []);
  return best.keys;
}

// Flatten the nested menu tree into a flat list of command items for the palette.
function flattenForCommandPalette(items: MenuItem[], parent?: MenuItem): CommandItem[] {
  const out: CommandItem[] = [];
  for (const it of items) {
    if (it.path) {
      out.push({
        id: it.key,
        label: it.label,
        hint: parent ? parent.label : undefined,
        group: parent ? parent.label : 'Top-level',
        icon: it.icon ? React.createElement(it.icon) : null,
        onSelect: () => { /* set in usage below */ },
        keywords: `${it.label} ${parent?.label ?? ''} ${it.moduleCode ?? ''}`.trim(),
      });
    }
    if (it.children) out.push(...flattenForCommandPalette(it.children, it));
  }
  return out;
}

/**
 * Recursively filter the menu tree by a query string. A node is kept if:
 *   - its label or moduleCode matches the query, OR
 *   - any of its descendants match (parent is kept to preserve the path)
 *
 * Returns a NEW tree — does not mutate the input.
 */
function filterMenuTree(items: MenuItem[], query: string): MenuItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const result: MenuItem[] = [];
  for (const it of items) {
    const labelMatch = it.label.toLowerCase().includes(q);
    const moduleMatch = (it.moduleCode ?? '').toLowerCase().includes(q);
    const tooltipMatch = (it.tooltip ?? '').toLowerCase().includes(q);
    const selfMatch = labelMatch || moduleMatch || tooltipMatch;
    const filteredChildren = it.children ? filterMenuTree(it.children, q) : undefined;
    if (selfMatch) {
      // Keep the whole subtree visible when the parent itself matches.
      result.push({ ...it, children: it.children });
    } else if (filteredChildren && filteredChildren.length > 0) {
      result.push({ ...it, children: filteredChildren });
    }
  }
  return result;
}

/** Collect every key in the tree — used to auto-expand all groups when searching. */

// Chrome toggle (sidebar + header shell) — see chromeMode.ts for the full rationale.

/* ──────────────────────────────────────────────────────────────────────
 * NotificationBell — wires the header bell to a Popover panel that lists
 * the user's recent notifications from the mock DB. Click a row to mark
 * read; "Mark all read" + "View all" footer actions wire to the same DB.
 * Replaces the inert <Badge count={5}> stub.
 * ────────────────────────────────────────────────────────────────────── */
type Notification = {
  id: string;
  userId?: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
};

function priorityTone(p: Notification['priority']): { bg: string; fg: string } {
  switch (p) {
    case 'critical': return { bg: '#fee2e2', fg: '#991b1b' };
    case 'high':     return { bg: '#fef3c7', fg: '#92400e' };
    case 'medium':   return { bg: '#dbeafe', fg: '#1e40af' };
    default:         return { bg: '#f1f5f9', fg: '#475569' };
  }
}

const NotificationBell: React.FC<{ userId: string; navigate: ReturnType<typeof useNavigate> }> = ({ userId, navigate }) => {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const notifications = useMemo<Notification[]>(() => {
    void tick; // re-read when tick bumps
    try {
      const all = db.getAllRaw('notifications') as unknown as Notification[];
      // Prefer this user's notifications; fall back to all if nothing matches
      const mine = all.filter((n) => !n.userId || n.userId === userId);
      const pool = mine.length > 0 ? mine : all;
      return pool
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 20);
    } catch {
      return [];
    }
  }, [userId, tick]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markRead = (id: string) => {
    try { db.update('notifications', id, { isRead: true, readAt: new Date().toISOString() }); } catch { /* noop */ }
    setTick((t) => t + 1);
  };
  const markAllRead = () => {
    notifications.forEach((n) => { if (!n.isRead) markRead(n.id); });
  };

  const goToEntity = (n: Notification) => {
    markRead(n.id);
    setOpen(false);
    if (!n.entityId) return;
    if (n.entityType === 'site') navigate(`/sites/${n.entityId}`);
    else if (n.entityType === 'permit') navigate('/sites');
    else if (n.entityType === 'issue') navigate('/issues');
    else if (n.entityType === 'crew') navigate('/crew');
  };

  const panel = (
    <div style={{ width: 360, maxWidth: 'calc(100vw - 48px)', maxHeight: 460, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 10px', borderBottom: "1px solid var(--vw-color-slate-100)" }}>
        <div>
          <div style={{ fontSize: "var(--vw-font-label-md)", fontWeight: 700, color: "var(--vw-color-slate-900)" }}>Notifications</div>
          <div style={{ fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-slate-500)" }}>{unreadCount} unread · {notifications.length} recent</div>
        </div>
        {unreadCount > 0 && (
          <Button size="small" type="link" icon={<CheckOutlined />} onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '6px 0' }}>
        {notifications.length === 0 ? (
          <Empty description="No notifications yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '24px 0' }} />
        ) : (
          notifications.map((n) => {
            const tone = priorityTone(n.priority);
            return (
              <div
                key={n.id}
                onClick={() => goToEntity(n)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '8px 1fr auto',
                  gap: 10,
                  padding: '10px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: n.isRead ? 'transparent' : '#f8fafc',
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = n.isRead ? 'transparent' : '#f8fafc'; }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6, height: 6, borderRadius: '50%', marginTop: "var(--vw-space-sm)",
                    background: n.isRead ? '#cbd5e1' : tone.fg,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--vw-font-label-sm)", fontWeight: 600, color: "var(--vw-color-slate-900)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-slate-600)", lineHeight: 1.5, marginTop: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>
                    {n.message}
                  </div>
                  <div className="vw-text-tertiary" style={{ fontSize: "var(--vw-font-label-xs)", marginTop: "var(--vw-space-xxs)" }}>
                    {n.createdAt} · {n.entityType ?? 'system'}
                  </div>
                </div>
                <span style={{ background: tone.bg, color: tone.fg, fontSize: "var(--vw-font-label-xs)", fontWeight: 700, padding: '2px 8px', borderRadius: "var(--vw-radius-xs)", height: 'fit-content', marginTop: "var(--vw-space-xxs)" }}>
                  {n.priority}
                </span>
              </div>
            );
          })
        )}
      </div>
      <div style={{ borderTop: "1px solid var(--vw-color-slate-100)", padding: '8px 4px 2px', textAlign: 'right' }}>
        <Button size="small" type="link" onClick={() => { setOpen(false); navigate('/admin/notifications'); }}>
          View all notifications →
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={panel}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      arrow={{ pointAtCenter: true }}
      styles={{ body: { padding: 12 } }}
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        <Button type="text" aria-label={`Notifications, ${unreadCount} unread`} icon={<BellOutlined />} style={{ color: open ? '#1d4ed8' : 'inherit' }} />
      </Badge>
    </Popover>
  );
};

export const AppLayout: React.FC = () => {
  const isDetail = useIsDetailRoute();
  useBalancedRows();
  useTruncationTitles();
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 991px)').matches);
  // Below the `lg` breakpoint the Sider can't coexist with content at a
  // usable width, so it switches to a zero-width, overlay-on-open drawer
  // instead of squeezing content and forcing horizontal scroll.
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 991px)').matches);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { user, switchUser, users } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Scroll the content area to the top on every route change so deep
  // navigations (kebab actions, quick-action buttons) don't land
  // mid-page on the new screen.
  useEffect(() => {
    const el = document.querySelector('main, .ant-layout-content') as HTMLElement | null;
    if (el) el.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  // ── Role-Based Perspective — the menu, command palette and density all
  //    adapt to the active perspective. See role-perspective-architecture.md.
  const { perspective, isSimulating, nativePerspective, exitSimulation } = usePerspective();
  // Sites are searchable by name, code, type and segment from the palette.
  const dcs = (useEntityList('dataCenters', { pageSize: 500 }).data?.data ?? []) as unknown as DataCenter[];
  const adaptedMenu = useMemo(() => adaptMenu(menuItems, perspective), [perspective]);

  // ── Sidebar menu search — filters the visible menu tree in place. The
  //    Cmd-K palette remains the global jump-anywhere experience; this
  //    is the discoverable "browse + narrow" filter for users staring at
  //    a tall menu and not knowing the exact label.
  const [menuQuery, setMenuQuery] = useState('');
  const filteredMenu = useMemo(
    () => filterMenuTree(adaptedMenu, menuQuery),
    [adaptedMenu, menuQuery],
  );

  const selectedKeys = findKeyByPath(adaptedMenu, location.pathname);

  // Wire navigate into each command item's onSelect at construction time.
  const commandItems = useMemo<CommandItem[]>(() => {
    const flat = flattenForCommandPalette(adaptedMenu);
    const items: CommandItem[] = flat.map((it) => ({
      ...it,
      onSelect: () => {
        const path = findPathByKey(adaptedMenu, it.id);
        if (path) navigate(path);
      },
    }));
    // Role-aware quick actions first — the active perspective's own shortcuts.
    const quick: CommandItem[] = perspective.quickActions.map((qa, i) => ({
      id: `__qa-${i}`,
      label: qa.label,
      hint: `${perspective.shortLabel} quick action`,
      group: 'For your perspective',
      icon: null,
      onSelect: () => navigate(qa.to),
      keywords: `${qa.label} quick action ${perspective.shortLabel}`,
    }));
    items.unshift(
      ...quick,
      { id: '__home', label: 'Network Overview', hint: 'Your landing screen', group: 'For your perspective', icon: null, onSelect: () => navigate('/'), keywords: 'home dashboard landing network overview' },
    );
    // Sites: "Central Office" finds every CO, "Telco" every telco site, a code or name the site itself.
    for (const d of dcs) {
      const t = dcTypeProfile(d.dcTypeKey);
      items.push({ id: `site-${d.id}`, label: d.name, hint: [d.code, t?.name, d.tier].filter(Boolean).join(' · '), group: 'Sites', icon: null, onSelect: () => navigate(`/facility/dc/${d.id}`), keywords: `site data center ${d.code} ${t?.name ?? ''} ${t?.segment ?? ''} ${t?.key ?? ''} ${d.tier} ${d.status}` });
    }
    // Types: jump to the map filtered to that kind of facility.
    for (const t of DC_TYPE_CATALOG) {
      items.push({ id: `dctype-${t.key}`, label: `${t.name} sites`, hint: `${t.segment} · show on map`, group: 'Data center types', icon: null, onSelect: () => navigate(`/map?type=${t.key}`), keywords: `type ${t.name} ${t.segment} ${t.key} facility` });
    }
    items.push({ id: 'dctypes', label: 'Data center types reference', hint: 'Taxonomy, envelopes and DCOS coverage', group: 'Data center types', icon: null, onSelect: () => navigate('/facility/dc-types'), keywords: 'dc types taxonomy reference catalogue' });
    return items;
  }, [navigate, adaptedMenu, perspective, dcs]);

  const pageCrumb = currentCrumb(adaptedMenu, selectedKeys[selectedKeys.length - 1]);

  const onMenuClick = ({ key }: { key: string }) => {
    // Defensive: even though parked items render with `disabled: true` on
    // the antd Menu (which suppresses the click event), gate here too so a
    // command-palette dispatch or programmatic key click can't bypass it.
    if (!INT_DISABLED_LIVE && isKeyIntDisabled(adaptedMenu, key)) return;
    const path = findPathByKey(adaptedMenu, key);
    if (path) navigate(path);
    // On mobile the Sider is an overlay drawer — close it after navigating
    // so the picked page is actually visible.
    if (isMobile) setCollapsed(true);
  };

  const userMenuItems = [
    {
      key: 'role',
      label: (
        <Space direction="vertical" size={0}>
          <Text strong>{user.roleName}</Text>
          <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}>{user.operatorName}</Text>
        </Space>
      ),
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'switch',
      icon: <SwapOutlined />,
      label: (
        <Select placeholder="Select user"
          size="small"
          value={user.id}
          onChange={(v) => switchUser(v)}
          onClick={(e) => e.stopPropagation()}
          style={{ width: 200 }}
          options={users.map(u => ({
            value: u.id,
            label: `${u.name} (${u.roleName})`,
          }))}
        />
      ),
    },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Logout' },
  ];

  // Playbook + Synopsis state — triggered from the header (icon buttons below)
  // in both full-chrome and headless modes, so the feature is never lost
  // when the floating help rail isn't rendered.
  const helpRail = useHelpRail();
  const headerHelpIcons = (
    <>
      <Tooltip title="Playbook — guided tour of the platform">
        <Button type="text" aria-label="Open playbook" icon={<ReadOutlined />} onClick={helpRail.openPlaybook} />
      </Tooltip>
      <Tooltip title="Synopsis — context for this page">
        <Button type="text" aria-label="Toggle page synopsis" icon={<InfoCircleOutlined />} onClick={helpRail.toggleSynopsis} />
      </Tooltip>
    </>
  );

  // ── Headless mode (VITE_SHOW_CHROME=false) ───────────────────────────────
  // Render only the routed content. Host shell is responsible for its own
  // header + sidenav — including the DC-scope selector, which each page
  // renders inline in its own title row (see `DcScopeInline` usages) so it
  // still works with no app-level header at all. We still mount the
  // CommandPalette so Cmd-K works, and we still honor the simulation banner
  // if a perspective is being simulated (it's a state alert, not chrome).
  if (!getShowChrome()) {
    return (
      <ConfigProvider componentSize={perspective.density === 'expert' ? 'small' : 'middle'}>
        {/*
          Embed-mode page-spacing rules.

          Goal: every page reads cleanly inside the host shell, regardless
          of whether the page wraps itself in `AMBIENT_BG` (most do — they
          come with 24-28-40 padding) or in a bare `<div style={{ paddingBottom: 24 }}>`
          (some H&S and admin pages don't have any horizontal inset).

          Approach:
            1. On `.ran-headless-outlet` itself — add a baseline 12 × 20 px
               inset so titles and content never butt against the host
               shell's container edge (where clipping/overflow can eat
               the first ~30 px — observed live on Site Safety Plan /
               Documents / Certification Management).
            2. On the FIRST CHILD of the outlet — neutralize the wrapper's
               `min-height: 100vh` and `background` so the host's surface
               shows through. We leave any horizontal padding alone so
               AMBIENT_BG pages keep their richer inset (compounds the
               baseline by a few px — invisible).
            3. Trim the AMBIENT_BG wrapper's vertical padding only — the
               host shell provides its own top/bottom margin; we don't
               need 24+40 px of additional vertical space stacked inside
               the host's content area.

          IMPORTANT: do NOT use `padding: 0 !important` on the wrapper —
          that's what caused the title-clipping in the first place.
        */}
        <style>{`
          /* Embed mode — zero spacing from us. The host template owns
             ALL outer page spacing (margin / padding / background); we
             render content edge-to-edge inside whatever box the host
             gives us.

             What we still neutralize on the page's own outer wrapper:
               • min-height: 0          — page wrappers default to
                                          \`min-height: 100vh\` so they
                                          fill a standalone viewport.
                                          Inside the host that stacks
                                          a second 100vh and creates a
                                          giant blank scroll area.
               • background: transparent — page wrappers carry their own
                                          gradient / surface. We let the
                                          host's surface show through.
               • padding: 20px          — every page's own padding varies
                                          (24/28/40/none — whatever that
                                          page happened to be written
                                          with). Normalize it to one
                                          guaranteed 20px inset here so
                                          content never sits flush against
                                          the host's edge, regardless of
                                          what the page itself set.

             What still works: the page's INNER cards, grids, KPI tiles,
             tables, etc. keep their own internal padding — the rule only
             touches the immediate child of the outlet wrapper. */
          .ran-headless-outlet {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
            overflow-x: clip;
          }
          .ran-headless-outlet > :not(.vw-wizard-page) {
            min-height: 0 !important;
            background: transparent !important;
            padding: 20px !important;
            max-width: 100%;
            box-sizing: border-box;
          }
        `}</style>
        <div className="ran-headless-layout" style={{ display: 'flex', flexDirection: 'column' }}>
          {isSimulating && (
            <div style={{ background: "var(--vw-color-amber-100)", borderBottom: "1px solid var(--vw-color-amber-200)", padding: '7px 24px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: "var(--vw-color-amber-800)" }}>
              <EyeOutlined />
              <span>
                <strong>Simulation</strong> — viewing the platform as <strong>{perspective.label}</strong>. Navigation, home screen and density reflect this perspective.
              </span>
              <button
                onClick={exitSimulation}
                style={{ marginLeft: 'auto', background: "var(--vw-color-amber-800)", color: '#fff', border: 'none', borderRadius: 6, padding: '3px 12px', fontSize: "var(--vw-font-label-sm)", fontWeight: 600, cursor: 'pointer' }}
              >
                Return to {nativePerspective.shortLabel}
              </button>
            </div>
          )}
          <div className="ran-headless-outlet">
            <DetailBreadcrumbs />
            <Outlet />
          </div>
          <CommandPalette items={commandItems} open={paletteOpen} onOpenChange={setPaletteOpen} />
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider componentSize={perspective.density === 'expert' ? 'small' : 'middle'}>
    <SynopsisProvider>
    {/* Whole-app shell pinned to the viewport. The outer Layout takes the
        full height and clips overflow so only the inner Content region
        actually scrolls — header and sidebar stay locked in place. */}
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        className="vw-app-navigation"
        collapsible
        trigger={null}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={isMobile ? 0 : 68}
        onBreakpoint={(broken) => {
          setIsMobile(broken);
          setCollapsed(broken);
        }}
        width={236}
        theme="light"
        style={{
          overflow: 'hidden',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          background: "var(--vw-color-white)",
          borderRight: 0,
          boxShadow: isMobile && !collapsed ? 'var(--shadow-pop, var(--shadow-sm))' : 'none',
          visibility: isMobile && collapsed ? 'hidden' : 'visible',
          pointerEvents: isMobile && collapsed ? 'none' : 'auto',
        }}
      >
        <div className={`rail dcos-rail${collapsed && !isMobile ? ' is-collapsed' : ''}`}>
          <a href={`${import.meta.env.BASE_URL}operate/command`} className="rail-brand" onClick={(e) => { e.preventDefault(); navigate('/operate/command'); }}>
            <span className="rail-logo"><Server size={18} /></span>
            <span className="rail-brand-text"><b>DCOS</b><span>NetSingularity</span></span>
          </a>
          <nav className="rail-scroll" aria-label="Main navigation">
            {!(collapsed && !isMobile) && (
              <label className="rail-filter">
                <SearchOutlined />
                <input
                  placeholder="Filter menu…"
                  value={menuQuery}
                  onChange={(e) => setMenuQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setMenuQuery(''); }}
                  aria-label="Filter menu"
                />
              </label>
            )}
            {menuQuery.trim() && filteredMenu.length === 0 && (
              <div className="rail-empty">No menu items match "{menuQuery}"</div>
            )}
            {railGroups(filteredMenu).map((g) => (
              <div className="rail-group" key={g.key}>
                <div className="rail-group-label">{g.label}</div>
                {g.items.map((it) => {
                  const parked = !INT_DISABLED_LIVE && (it.intDisabled === true || g.parked);
                  const active = selectedKeys.includes(it.key);
                  const Ico = it.icon;
                  return (
                    <button
                      key={it.key}
                      type="button"
                      className={`rail-link${active ? ' is-active' : ''}${parked ? ' is-parked' : ''}`}
                      title={collapsed && !isMobile ? it.label : (it.tooltip ?? undefined)}
                      aria-current={active ? 'page' : undefined}
                      disabled={parked}
                      onClick={() => onMenuClick({ key: it.key })}
                    >
                      {Ico && <Ico />}<span>{it.label}</span>
                      {(it.integration || parked) && <em className="rail-badge" style={{ fontStyle: 'normal' }}>INT</em>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          {!isMobile && (
            <div className="rail-foot">
              <button type="button" className="rail-link" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
                {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>Collapse</span>
              </button>
            </div>
          )}
        </div>
      </Sider>
      {/* On mobile the Sider floats over content as a drawer — dim and
          intercept clicks on the rest of the page while it's open so it
          reads as an overlay, not a layout column. */}
      {isMobile && !collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 90 }}
        />
      )}
      <Layout style={{
        // Mobile Sider is zero-width and overlays content, so it never
        // reserves layout space — only the desktop rail/full widths do.
        marginLeft: isMobile ? 0 : (collapsed ? 68 : 236),
        transition: 'margin-left 0.2s',
        background: 'var(--nstPageBackground)',
        // Column flex so Header + Content split the viewport height. Content
        // gets the only scroll; everything above it stays parked at top.
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        <Header className="dcos-app-header" style={{
          background: 'rgba(255, 255, 255, .88)',
          backdropFilter: 'saturate(1.6) blur(10px)',
          padding: '0 20px',
          height: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          borderBottom: '1px solid var(--vw-color-slate-200)',
          flexShrink: 0,
          zIndex: 9,
          lineHeight: 'normal',
        }}>
          <nav className="topbar-crumbs" aria-label="Current page">
            {pageCrumb.group && <span className="row" style={{ gap: 6 }}>{pageCrumb.group}<ChevronRight size={14} className="faint" /></span>}
            <b>{pageCrumb.label}</b>
          </nav>
          <div className="topbar-spacer" />
          <button type="button" className="topbar-search dcos-command-trigger" onClick={() => setPaletteOpen(true)} aria-label="Open command palette" title="Search & jump to anything">
            <Search size={15} /><span className="ellipsis">Search racks, subnets, changes, devices…</span><kbd>⌘K</kbd>
          </button>
          {/* Below ~640px the full right-side cluster (audit icon, profile
              pill, 2 help icons, notifications, avatar+name) doesn't fit
              next to the search box and silently overflows the header —
              several icons render entirely off-screen with no scrollbar or
              affordance to reach them. The profile pill and the username
              text are purely informational (the avatar dropdown still
              exposes the name), so they're the ones hidden to bring the
              cluster back inside the viewport; every remaining icon stays
              clickable. */}
          <style>{`
            @media (max-width: 640px) {
              .header-perspective-pill, .header-user-name { display: none; }
            }
          `}</style>
          <Space className="dcos-header-actions" size={16} style={{ flexShrink: 0 }}>
            {isMobile && (
              <Button type="text" aria-label={collapsed ? 'Open navigation' : 'Close navigation'} aria-expanded={!collapsed} icon={<MenuOutlined />} onClick={() => setCollapsed(!collapsed)} />
            )}
            <Tooltip title="Consolidated audit log"><Button type="text" aria-label="Open audit log" icon={<AuditOutlined />} onClick={() => navigate('/audit')} /></Tooltip>
            <span className="header-perspective-pill"><PerspectiveSwitcher /></span>
            {headerHelpIcons}
            <NotificationBell userId={user.id} navigate={navigate} />
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <button type="button" className="avatar-me" title={user.name} aria-label={`Account menu for ${user.name}`} style={{ border: 0, cursor: 'pointer' }}>
                {user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
              </button>
            </Dropdown>
          </Space>
        </Header>
        {isSimulating && (
          <div style={{ background: "var(--vw-color-amber-100)", borderBottom: "1px solid var(--vw-color-amber-200)", padding: '7px 24px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: "var(--vw-color-amber-800)" }}>
            <EyeOutlined />
            <span>
              <strong>Simulation</strong> — viewing the platform as <strong>{perspective.label}</strong>. Navigation, home screen and density reflect this perspective.
            </span>
            <button
              onClick={exitSimulation}
              style={{ marginLeft: 'auto', background: "var(--vw-color-amber-800)", color: '#fff', border: 'none', borderRadius: 6, padding: '3px 12px', fontSize: "var(--vw-font-label-sm)", fontWeight: 600, cursor: 'pointer' }}
            >
              Return to {nativePerspective.shortLabel}
            </button>
          </div>
        )}
        {/* Content row: page content scrolls; the help rail/panel are flex
            siblings on the right so opening the Synopsis reflows (not overlays)
            the page. */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <Content className={`vw-page-container${isDetail ? ' dcos-detail-page' : ''}`} style={{
            // Owns the scroll. Everything else (Sider, Header, optional
            // simulation banner) is pinned to the viewport.
            // `padding` (not `margin`) on purpose: pages lay out KPI/metric
            // rows with antd's `Row gutter={...}`, which bleeds a negative
            // margin (-gutter/2 on each side) outside its own box by design
            // — normally absorbed by a padded ancestor. With only a margin
            // here there's no padding to absorb it, so that bleed escapes
            // past this scrollable Content's own edge and shows up as a
            // real (if small) horizontal scrollbar on every page that uses
            // Row/gutter, even at ordinary desktop widths. Padding keeps
            // the same visual inset from the Sider/Header while giving the
            // bleed somewhere to go.
            padding: "var(--vw-page-gap)",
            minHeight: 0,
            minWidth: 0,
            flex: 1,
            overflow: 'auto',
          }}>
            <DetailBreadcrumbs />
            <Outlet />
          </Content>
          <HelpRailPanel help={helpRail} />
        </div>
      </Layout>
      {/* Global command palette — Cmd/Ctrl+K */}
      <CommandPalette items={commandItems} open={paletteOpen} onOpenChange={setPaletteOpen} />
      <HelpRailModal help={helpRail} />
      <CopilotFab />
    </Layout>
    </SynopsisProvider>
    </ConfigProvider>
  );
};
