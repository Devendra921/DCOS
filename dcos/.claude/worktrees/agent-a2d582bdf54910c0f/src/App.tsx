import { RouterProvider } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './core/auth/AuthContext';
import { MockDBGate } from './core/mock-db/MockDBGate';
import { PerspectiveProvider } from './core/perspective';
import { DcScopeProvider } from './core/scope/DcScope';
import { themeConfig } from './core/theme/themeConfig';
import { router } from './app/router';
import { CHART_KEYFRAMES, PULSE_KEYFRAMES } from './shared/components/ux';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={themeConfig}>
        <AntdApp>
          <AuthProvider>
            <PerspectiveProvider>
              <DcScopeProvider>
              <MockDBGate>
                {/* Global motion keyframes — pulse + chart draw/reveal/rise */}
                <style>{PULSE_KEYFRAMES}{CHART_KEYFRAMES}</style>
                <RouterProvider router={router} />
              </MockDBGate>
              </DcScopeProvider>
            </PerspectiveProvider>
          </AuthProvider>
        </AntdApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
