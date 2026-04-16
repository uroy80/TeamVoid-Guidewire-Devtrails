import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Render error:', error, info);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--bg-primary)',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            textAlign: 'center',
            padding: 32,
            borderRadius: 16,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              background: 'rgba(239,68,68,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <i className="ri-error-warning-line" style={{ fontSize: 30, color: '#ef4444' }} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
            We hit an unexpected error. Try reloading the page — your data is safe.
          </p>

          {this.state.error && (
            <details style={{ textAlign: 'left', marginBottom: 16 }}>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                }}
              >
                Technical details
              </summary>
              <pre
                style={{
                  fontSize: 11,
                  background: 'var(--bg-tertiary, var(--bg-card))',
                  padding: 10,
                  borderRadius: 8,
                  overflow: 'auto',
                  maxHeight: 160,
                  color: 'var(--text-secondary)',
                }}
              >
                {this.state.error.message}
                {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
              </pre>
            </details>
          )}

          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '10px 24px',
              borderRadius: 10,
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <i className="ri-refresh-line" />
            Reload
          </button>
        </div>
      </div>
    );
  }
}
