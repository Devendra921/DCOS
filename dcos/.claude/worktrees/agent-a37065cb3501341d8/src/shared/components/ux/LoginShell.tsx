/**
 * LoginShell — canonical sign-in surface for the platform.
 *
 * VW sign-in: split-pane composition with a neutral brand panel and
 * a canonical card containing the sign-in form.
 * Single-column on narrow viewports.
 *
 * The shell is *presentational only* — it accepts an `onSubmit` (and an
 * optional `onSelectUser` quick-switch dropdown for the demo) so it can wrap
 * any real auth flow.
 */

import React, { useState } from 'react';
import { Input, Form, Select, Tooltip } from 'antd';
import { VwButton as Button } from '../vw/VwButton';

import { LockOutlined, MailOutlined, SafetyCertificateOutlined } from '../../icons';
import { UX } from './uxTokens';
import { GlassCard } from './GlassCard';
import { PulseDot } from './PulseDot';

export interface LoginShellProps {
  /** Brand name displayed in the marketing pane. */
  productName?: string;
  /** Optional brand mark / SVG / image rendered above the title. */
  brandMark?: React.ReactNode;
  /** Marketing copy under the title. */
  tagline?: React.ReactNode;
  /** Optional "feature pills" rendered under the tagline. */
  features?: Array<{ icon?: React.ReactNode; label: string }>;
  /** Submit handler — receives email/password/sso. Throw to surface an error. */
  onSubmit?: (creds: { email: string; password: string }) => Promise<void> | void;
  /** SSO providers to expose. */
  ssoProviders?: Array<{ key: string; label: string; icon?: React.ReactNode; onClick: () => void }>;
  /**
   * Demo-only quick-switch dropdown (e.g. test users). When supplied, renders
   * below the form for instant context switching without typing.
   */
  quickSwitch?: { users: Array<{ id: string; name: string; roleName: string }>; onSelect: (id: string) => void };
  /** Optional footer (links to legal, support, etc.). */
  footer?: React.ReactNode;
}

export function LoginShell({
  productName = 'DCOS',
  brandMark,
  tagline = 'The operating system for telecom networks.',
  features = [
    { icon: <SafetyCertificateOutlined />, label: 'SOC 2 Type II' },
    { icon: <SafetyCertificateOutlined />, label: 'ISO 27001' },
    { icon: <SafetyCertificateOutlined />, label: 'TR-069 compliant' },
  ],
  onSubmit,
  ssoProviders = [],
  quickSwitch,
  footer,
}: LoginShellProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async (values: { email: string; password: string }) => {
    if (!onSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (e) {
      setError((e as Error).message ?? 'Sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="vw-login-shell-grid"
      style={{
        background: "var(--vw-color-gray-50)",
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 480px)',
        gap: 0,
      }}
    >
      {/* Below ~767px the marketing pane's 480px-minimum sign-in column no
          longer fits alongside it — stack the two panes instead of letting
          them overlap. */}
      <style>{`
        @media (max-width: 767px) {
          .vw-login-shell-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* Marketing pane */}
      <div
        style={{
          padding: "var(--vw-space-4xl)",
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: "var(--vw-color-gray-900)",
          color: "var(--vw-color-slate-50)",
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1 }}>
          {brandMark && <div style={{ marginBottom: "var(--vw-space-2xl)" }}>{brandMark}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: "var(--vw-space-sm)", marginBottom: "var(--vw-space-lg)" }}>
            <PulseDot status="ok" size={7} />
            <span style={{ fontSize: "var(--vw-font-label-xs)", color: "var(--vw-color-gray-300)", fontWeight: 400 }}>
              Network live · 12,408 sites
            </span>
          </div>
          <h1
            style={{
              fontSize: "var(--vw-font-metric-hero, 32px)",
              lineHeight: 1.05,
              fontWeight: 500,
              margin: 0,
              letterSpacing: 0,
              color: "var(--vw-color-slate-50)",
              maxWidth: 540,
            }}
          >
            {productName}
          </h1>
          <p style={{ fontSize: "var(--vw-font-heading-lg)", color: "var(--vw-color-gray-100)", maxWidth: 480, marginTop: "var(--vw-space-lg)", lineHeight: 1.55 }}>
            {tagline}
          </p>
        </div>

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexWrap: 'wrap', gap: "var(--vw-space-sm)" }}>
          {features.map((f) => (
            <span
              key={f.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: "var(--vw-space-xs)",
                background: "var(--vw-color-gray-800)",
                border: "1px solid var(--vw-color-gray-700)",
                color: "var(--vw-color-gray-100)",
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: "var(--vw-font-label-sm)",
                fontWeight: 500,
              }}
            >
              {f.icon}
              {f.label}
            </span>
          ))}
        </div>
      </div>

      {/* Sign-in pane */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: "var(--vw-space-xl)",
        }}
      >
        <GlassCard
          elevation="hero"
          padding={16}
          style={{
            width: '100%',
            maxWidth: 400,
          }}
        >
          <div style={{ marginBottom: "var(--vw-space-2xl)" }}>
            <h2 style={{ fontSize: "var(--vw-font-heading-2xl)", fontWeight: 500, margin: 0, color: UX.slate, letterSpacing: 0 }}>
              Sign in
            </h2>
            <p style={{ fontSize: "var(--vw-font-label-md)", color: UX.muted, margin: '6px 0 0' }}>
              Use your work email to access the platform.
            </p>
          </div>

          <Form layout="vertical" onFinish={handleFinish} requiredMark={false}>
            <Form.Item
              label={<span style={{ fontSize: "var(--vw-font-label-sm)", color: UX.muted, fontWeight: 500 }}>Work email</span>}
              name="email"
              rules={[{ required: true, message: 'Email required' }, { type: 'email', message: 'Invalid email' }]}
            >
              <Input
                size="middle"
                prefix={<MailOutlined style={{ color: UX.muted }} />}
                placeholder="you@operator.com"
                autoComplete="email"
              />
            </Form.Item>
            <Form.Item
              label={<span style={{ fontSize: "var(--vw-font-label-sm)", color: UX.muted, fontWeight: 500 }}>Password</span>}
              name="password"
              rules={[{ required: true, message: 'Password required' }]}
            >
              <Input.Password
                size="middle"
                prefix={<LockOutlined style={{ color: UX.muted }} />}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </Form.Item>

            {error && (
              <div
                role="alert"
                style={{
                  background: "var(--vw-color-red-50)",
                  border: "1px solid var(--vw-color-red-200)",
                  color: UX.red,
                  fontSize: "var(--vw-font-label-sm)",
                  padding: '8px 12px',
                  borderRadius: "var(--vw-radius-sm)",
                  marginBottom: "var(--vw-space-md)",
                }}
              >
                {error}
              </div>
            )}

            <Button
              type="primary"
              htmlType="submit"
              size="middle"
              loading={submitting}
              block
            >
              Sign in
            </Button>
          </Form>

          {ssoProviders.length > 0 && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: "var(--vw-space-sm)",
                  margin: '20px 0 14px',
                  color: UX.muted,
                  fontSize: "var(--vw-font-label-xs)",
                  fontWeight: 400,
                }}
              >
                <div style={{ flex: 1, height: 1, background: UX.border }} />
                or continue with
                <div style={{ flex: 1, height: 1, background: UX.border }} />
              </div>
              <div style={{ display: 'grid', gap: "var(--vw-space-sm)" }}>
                {ssoProviders.map((p) => (
                  <Button
                    key={p.key}
                    icon={p.icon}
                    onClick={p.onClick}
                    block
                    size="middle"
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </>
          )}

          {quickSwitch && (
            <div
              style={{
                marginTop: "var(--vw-space-xl)",
                padding: "var(--vw-space-md)",
                background: "var(--vw-color-gray-50)",
                border: `1px solid ${UX.border}`,
                borderRadius: "var(--vw-radius-md)",
              }}
            >
              <div style={{ fontSize: "var(--vw-font-label-xs)", color: UX.muted, fontWeight: 500, marginBottom: 6 }}>
                Demo · Quick-switch user
              </div>
              <Tooltip title="Bypass auth — switch to any seeded test user">
                <Select
                  size="middle"
                  style={{ width: '100%' }}
                  placeholder="Select a role to impersonate"
                  onChange={quickSwitch.onSelect}
                  options={quickSwitch.users.map((u) => ({
                    value: u.id,
                    label: (
                      <span style={{ display: 'inline-flex', justifyContent: 'space-between', width: '100%' }}>
                        <span>{u.name}</span>
                        <span style={{ color: UX.muted, fontSize: "var(--vw-font-label-xs)" }}>{u.roleName}</span>
                      </span>
                    ),
                  }))}
                />
              </Tooltip>
            </div>
          )}

          {footer && (
            <div style={{ marginTop: "var(--vw-space-2xl)", fontSize: "var(--vw-font-label-xs)", color: UX.muted, textAlign: 'center' }}>
              {footer}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
