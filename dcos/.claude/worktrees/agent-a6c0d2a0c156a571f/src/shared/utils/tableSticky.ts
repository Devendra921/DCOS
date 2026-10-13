/**
 * TABLE_STICKY — the `sticky` prop every `<Table sticky ...>` in this app
 * should use instead of the bare boolean.
 *
 * antd/rc-table's sticky header positions itself with real CSS
 * `position: sticky`, which works fine against any scrolling ancestor. But
 * `sticky`'s *other* half — the floating horizontal scrollbar it shows when
 * a wide table's real scrollbar has scrolled out of view — decides whether
 * to show/hide itself from `getContainer()`, which **defaults to `window`**
 * (see rc-table's `useSticky` hook). This app's page content doesn't scroll
 * `window` — the actual scrolling element is `AppLayout`'s `<Content>`
 * (`.ant-layout-content`) — so with the default, that visibility check
 * measures against `window.innerHeight`/`document.documentElement.scrollTop`,
 * values that never change here, instead of the real visible area. The
 * floating scrollbar ends up showing/hiding at the wrong scroll positions —
 * this is the stray bar sometimes visible near a sticky table.
 *
 * Usage: `<Table sticky={TABLE_STICKY} ... />` instead of `<Table sticky ...>`.
 */
export function getAppScrollContainer(): HTMLElement | Window {
  return (document.querySelector('.ant-layout-content') as HTMLElement | null) ?? window;
}

export const TABLE_STICKY = { getContainer: getAppScrollContainer };
