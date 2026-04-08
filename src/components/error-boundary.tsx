import { Component, type ReactNode } from 'react';
import { clearSavedLayout } from '@/lib/layout-storage';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  handleReset = () => {
    clearSavedLayout();
    this.setState({ error: null });
    window.location.reload();
  };

  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 32,
            fontFamily: 'Inter, system-ui, sans-serif',
            background: '#08090a',
            color: '#d4d4d8',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <h2 style={{ color: '#ef4444', fontSize: 16, margin: 0 }}>
            Something went wrong
          </h2>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: 12,
              color: '#a1a1aa',
              background: 'rgba(255,255,255,0.03)',
              padding: 16,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.06)',
              overflow: 'auto',
              maxHeight: 300,
            }}
          >
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={this.handleReset}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid rgba(59,130,246,0.3)',
              background: 'rgba(59,130,246,0.12)',
              color: '#93c5fd',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Reset layout &amp; reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
