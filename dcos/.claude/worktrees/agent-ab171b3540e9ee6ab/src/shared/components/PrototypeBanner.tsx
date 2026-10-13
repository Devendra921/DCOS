import React from 'react';

/**
 * Prototype-mode disclosure banner — DISABLED.
 *
 * The "Prototype mode. KPIs use deterministic demo data, and Save /
 * Approve / Submit buttons simulate state changes…" banner was removed
 * per UX feedback. Rather than touch every call-site (~14 pages), the
 * component itself now returns null so the banner — AND its trailing
 * 16px marginBottom — disappears everywhere in one place. No leftover
 * white-space gap.
 *
 * Props kept on the type for backwards-compat with existing call-sites
 * (`id`, `variant`, `message`). If the disclosure ever needs to come
 * back, just restore the original render here.
 */
export const PrototypeBanner: React.FC<{
  id: string;
  variant?: 'actions' | 'demo-data' | 'both';
  message?: React.ReactNode;
}> = () => null;
