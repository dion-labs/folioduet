import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Keeps a render crash from becoming a silent blank page. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[FolioDuet] Render crash', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="pe-app" data-theme="dark">
        <div className="pe-login">
          <div className="pe-login-card">
            <p className="pe-login-kicker">PAGE ECHO</p>
            <h1>Something broke</h1>
            <p className="pe-login-copy">
              The reader hit an unexpected error. Reload to continue — your cloud library is safe.
            </p>
            <p className="pe-login-error">{this.state.error.message}</p>
            <button
              type="button"
              className="pe-login-btn"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
