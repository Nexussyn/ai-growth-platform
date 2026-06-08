import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  label?: string; // shown in the error card, e.g. "Payout Monitor"
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ''}]`, error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const isFullPage = !this.props.label;
      if (isFullPage) {
        return (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="max-w-lg w-full bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
              <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center gap-3">
                <AlertTriangle size={18} className="text-red-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Dashboard render error</p>
                  <p className="text-xs text-red-600">A component crashed. Your data in Supabase is safe.</p>
                </div>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="bg-gray-900 rounded-lg px-4 py-3 overflow-auto max-h-40">
                  <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap break-all">
                    {this.state.error.message}
                  </pre>
                </div>
                <button
                  onClick={() => { this.setState({ error: null }); window.location.reload(); }}
                  className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-700 transition-colors"
                >
                  <RefreshCw size={14} />
                  Reload dashboard
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Inline panel error — keeps rest of dashboard visible
      return (
        <div className="bg-white rounded-xl border border-red-100 shadow-sm p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={15} className="text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">
                {this.props.label ?? 'Panel'} failed to render
              </p>
              <p className="text-xs text-gray-400 mt-0.5 font-mono break-all">
                {this.state.error.message}
              </p>
            </div>
            <button
              onClick={() => this.setState({ error: null })}
              className="shrink-0 text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
