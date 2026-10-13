import { useEffect } from 'react';

/* Drawer and dialog titles stay on one line and end in an ellipsis. When one is cut
   off, its full text is shown as a tooltip (the native title); when it fits, no tooltip. */
const TARGETS = [
  '.ant-drawer-title',
  '.ant-drawer-title > .vw-flex > span:first-child',
  '.ant-modal-title',
  '.drawer-head h2',
].join(',');

function fitValues() {
  document.querySelectorAll<HTMLElement>('.dco-tile > .dco-v').forEach((el) => {
    const n = (el.textContent ?? '').trim().length;
    if (n > 26) el.dataset.long = 'xl'; else if (n > 12) el.dataset.long = '1'; else delete el.dataset.long;
    const cut = el.scrollWidth > el.clientWidth + 1;
    if (cut && !el.title) { el.title = (el.textContent ?? '').trim(); el.dataset.autoTitle = '1'; }
    else if (!cut && el.dataset.autoTitle === '1') { el.removeAttribute('title'); delete el.dataset.autoTitle; }
  });
}

function label() {
  fitValues();
  document.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => {
    const cut = el.scrollWidth > el.clientWidth + 1;
    const auto = el.dataset.autoTitle === '1';
    if (cut && (!el.title || auto)) { el.title = (el.textContent ?? '').trim(); el.dataset.autoTitle = '1'; }
    else if (!cut && auto) { el.removeAttribute('title'); delete el.dataset.autoTitle; }
  });
}

export function useTruncationTitles() {
  useEffect(() => {
    let t = 0;
    const schedule = () => { window.clearTimeout(t); t = window.setTimeout(label, 80); };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    return () => { window.clearTimeout(t); mo.disconnect(); window.removeEventListener('resize', schedule); };
  }, []);
}
