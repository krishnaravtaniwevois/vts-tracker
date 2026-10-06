import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CRITICAL: React ErrorBoundary caught an unhandled component error:', error, errorInfo);
    this.setState({ errorInfo });
    try {
      localStorage.setItem('vts_latest_crash_error', JSON.stringify({
        message: error ? (error.message || error.toString()) : 'Unknown error',
        stack: error ? error.stack : '',
        componentStack: errorInfo ? errorInfo.componentStack : '',
        time: new Date().toISOString()
      }));
    } catch (e) {
      console.warn('Could not save error to localStorage', e);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleClearCacheAndReload = () => {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('vts_sheet_cache_') || k.startsWith('vts_ai_') || k.startsWith('vts_renewal_') || k.startsWith('vts_cached_'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch (e) {
      console.warn('Cache clear error:', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          padding: '24px'
        }}>
          <div style={{
            maxWidth: '680px',
            width: '100%',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '32px',
            border: '1px solid #e2e8f0',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#fee2e2',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              margin: '0 auto 16px'
            }}>
              ⚠️
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px' }}>
              Web App Auto-Recovered
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 24px', lineHeight: '1.5' }}>
              An unexpected render issue was safely intercepted to prevent a blank screen. Your session data is preserved.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '10px 18px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                }}
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '10px 18px',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Reload App
              </button>
              <button
                onClick={this.handleClearCacheAndReload}
                style={{
                  padding: '10px 18px',
                  background: '#fff',
                  color: '#dc2626',
                  border: '1px solid #fca5a5',
                  borderRadius: '8px',
                  fontWeight: '500',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Clear Temp Cache & Reload
              </button>
            </div>

            {this.state.error && (
              <details open style={{ textAlign: 'left', marginTop: '16px', background: '#fef2f2', padding: '14px', borderRadius: '10px', border: '1px solid #fecaca' }}>
                <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#991b1b', fontWeight: '700', marginBottom: '8px' }}>
                  Technical Details (Auto-Expanded)
                </summary>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#b91c1c', marginBottom: '6px' }}>
                  {this.state.error.name ? `${this.state.error.name}: ` : ''}{this.state.error.message || this.state.error.toString()}
                </div>
                <pre style={{ margin: '6px 0 0', fontSize: '11px', color: '#dc2626', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#ffffff', padding: '8px', borderRadius: '6px', border: '1px solid #fee2e2' }}>
                  {this.state.error.stack || this.state.error.toString()}
                </pre>
                {this.state.errorInfo && (
                  <pre style={{ margin: '8px 0 0', fontSize: '10px', color: '#6b7280', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`TabErrorBoundary [${this.props.tabName}] caught error:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel" style={{ padding: '24px', margin: '20px 0', border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <strong style={{ fontSize: '15px' }}>{this.props.tabName || 'This section'} encountered an issue while loading.</strong>
          </div>
          <p style={{ fontSize: '13px', color: '#b91c1c', margin: '0 0 12px' }}>
            {this.state.error ? (this.state.error.message || this.state.error.toString()) : 'An unexpected error occurred.'}
          </p>
          <button
            className="primary-button compact"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ background: '#dc2626' }}
          >
            🔄 Retry {this.props.tabName || 'Section'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

