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
        <div className="flex items-center justify-center h-96 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="text-center max-w-md p-6">
            <div className="text-lg font-medium text-red-600 mb-2">
              Rendering Error
            </div>
            <div className="text-sm text-gray-600 mb-4">
              The artifact failed to render. This might be due to:
            </div>
            <ul className="text-xs text-gray-500 text-left mb-6 space-y-1">
              <li>• Network connectivity issues</li>
              <li>• Sandpack bundler timeout</li>
              <li>• Invalid code or dependencies</li>
              <li>• Browser compatibility issues</li>
            </ul>
            <div className="space-y-2">
              <button
                onClick={this.reset}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
              <div className="text-xs text-gray-400">
                Check browser console for detailed error information
              </div>
            </div>
            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-gray-500 cursor-pointer">
                  Show Error Details
                </summary>
                <pre className="text-xs text-red-600 mt-2 p-2 bg-red-50 rounded overflow-auto max-h-32">
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