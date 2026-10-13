/**
 * LoginPage — wraps the canonical LoginShell with demo wiring.
 *
 * Real auth is not implemented (mock app); this page demonstrates the
 * primitive's API by:
 *   - rendering the brand pane
 *   - hooking the form's onSubmit to a no-op that simulates latency
 *   - exposing the quick-switch dropdown driven by AuthContext's seeded users
 *
 * Route: /login
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiOutlined, GoogleOutlined, WindowsOutlined } from '../shared/icons';
import { LoginShell } from '../shared/components/ux';
import { useAuth } from '../core/auth/AuthContext';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { users, switchUser } = useAuth();

  return (
    <LoginShell
      productName="DCOS"
      tagline="Plan, deliver and operate every site, every program — across vendors, technologies and geographies."
      brandMark={
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: "var(--vw-color-slate-50)" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--vw-radius-md)",
              background: "var(--vw-color-gray-700)",
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: "var(--vw-font-heading-lg)",
            }}
          >
            <ApiOutlined />
          </div>
          <span style={{ fontWeight: 500, fontSize: "var(--vw-font-heading-md)", letterSpacing: -0.3 }}>DCOS</span>
        </div>
      }
      onSubmit={async ({ email }) => {
        // Demo: pretend latency, then route based on the seeded test user pool
        await new Promise((r) => setTimeout(r, 600));
        const match = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (match) {
          switchUser(match.id);
          navigate('/');
          return;
        }
        throw new Error('No matching user — try Quick-switch below or use a seeded email.');
      }}
      ssoProviders={[
        { key: 'google', label: 'Sign in with Google', icon: <GoogleOutlined />, onClick: () => navigate('/') },
        { key: 'azure', label: 'Sign in with Microsoft', icon: <WindowsOutlined />, onClick: () => navigate('/') },
      ]}
      quickSwitch={{
        users: users.map((u) => ({ id: u.id, name: u.name, roleName: u.roleName })),
        onSelect: (id) => {
          switchUser(id);
          navigate('/');
        },
      }}
      footer={
        <span>
          By signing in you agree to the{' '}
          <a href="#" style={{ color: 'inherit', textDecoration: 'underline' }}>Terms</a> and{' '}
          <a href="#" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy Policy</a>.
        </span>
      }
    />
  );
};

export default LoginPage;
