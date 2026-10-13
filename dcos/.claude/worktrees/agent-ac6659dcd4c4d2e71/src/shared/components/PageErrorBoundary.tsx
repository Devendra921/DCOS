import React from 'react';
import { Result, Typography, Space } from 'antd';
import { VwButton as Button } from './vw/VwButton';

import { ReloadOutlined, ArrowLeftOutlined } from '../icons';

const { Paragraph, Text } = Typography;

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
}

interface Props {
  children: React.ReactNode;
  // Short label shown in the fallback title, e.g. "Site Detail".
  pageLabel?: string;
}

// Route-level boundary. Any render error inside the wrapped tree is caught
// here so a localized crash (a single tab, a single section) cannot take
// the whole app down. Demo-friendly: shows the error message + a "Reload"
// button. In production we'd report to an error tracker here.
export default class PageErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error('[PageErrorBoundary]', error, info);
  }

  handleReload = () => window.location.reload();
  handleBack = () => window.history.back();

  render() {
    if (!this.state.error) return this.props.children;
    const { pageLabel } = this.props;
    return (
      <Result
        status="error"
        title={`${pageLabel ?? 'This page'} hit a render error`}
        subTitle="The rest of the app is fine. You can reload this page or go back."
        extra={
          <Space>
            <Button type="primary" icon={<ReloadOutlined />} onClick={this.handleReload}>
              Reload page
            </Button>
            <Button icon={<ArrowLeftOutlined />} onClick={this.handleBack}>
              Go back
            </Button>
          </Space>
        }
      >
        <Paragraph>
          <Text strong>Error: </Text>
          <Text code>{this.state.error.message}</Text>
        </Paragraph>
        {this.state.info?.componentStack && (
          <details style={{ marginTop: "var(--vw-space-md)" }}>
            <summary style={{ cursor: 'pointer' }}>Component stack</summary>
            <pre style={{ fontFamily: 'inherit', fontSize: "var(--vw-font-label-xs)", maxHeight: 240, overflow: 'auto', background: "var(--vw-color-neutral-50)", padding: "var(--vw-space-md)", borderRadius: "var(--vw-radius-xs)" }}>
              {this.state.info.componentStack}
            </pre>
          </details>
        )}
      </Result>
    );
  }
}
