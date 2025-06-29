import React from 'react';

interface SandpackErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface SandpackErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>;
}

class SandpackErrorBoundary extends React.Component<
  SandpackErrorBoundaryProps,
  SandpackErrorBoundaryState
> {
  constructor(props: SandpackErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): SandpackErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Sandpack Error Boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error!} reset={this.reset} />;
      }

      return (
        <div className="flex h-96 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
          <div className="max-w-md p-6 text-center">
            <div className="mb-2 text-lg font-medium text-red-600">Rendering Error</div>
            <div className="mb-4 text-sm text-gray-600">
              The artifact failed to render. This might be due to:
            </div>
            <ul className="mb-6 space-y-1 text-left text-xs text-gray-500">
              <li>• Network connectivity issues</li>
              <li>• Sandpack bundler timeout</li>
              <li>• Invalid code or dependencies</li>
              <li>• Browser compatibility issues</li>
            </ul>
            <div className="space-y-2">
              <button
                onClick={this.reset}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
              >
                Try Again
              </button>
              <div className="text-xs text-gray-400">
                Check browser console for detailed error information
              </div>
            </div>
            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-xs text-gray-500">
                  Show Error Details
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-red-50 p-2 text-xs text-red-600">
                  {this.state.error.message}
                  {this.state.error.stack && `\n${this.state.error.stack}`}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SandpackErrorBoundary;
