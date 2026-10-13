import { useEffect, useState, type ReactNode } from 'react';
import { Spin } from 'antd';
import { dbReady, isMockDbReady } from '../../mock/db';

/**
 * Blocks the app until the mock DB is hydrated (JSON fetch or runtime seed).
 * Prevents pages from reading an empty DB when loaded in multiple iframes.
 */
export function MockDBGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isMockDbReady);

  useEffect(() => {
    if (ready) return;
    let mounted = true;
    dbReady.then(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [ready]);

  if (!ready) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          gap: "var(--vw-space-lg)",
        }}
      >
        <Spin size="large" />
        <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: "var(--vw-font-label-md)" }}>
          Loading portfolio data…
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
