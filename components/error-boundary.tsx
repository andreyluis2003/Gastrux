'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { captureException, addBreadcrumb } from '@/lib/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary with Sentry integration
 * Catches JavaScript errors anywhere in component tree
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to Sentry
    captureException(error, {
      componentStack: errorInfo.componentStack,
      boundaryName: this.props.name || 'unnamed',
    });

    addBreadcrumb(
      `Error Boundary caught error in ${this.props.name || 'unnamed'}`,
      { error: error.message, stack: errorInfo.componentStack },
      'error'
    );

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-gradient-to-br from-red-50 to-orange-50 rounded-lg border border-red-200">
          <div className="max-w-md text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-red-800 mb-3">
              Algo deu errado
            </h2>
            <p className="text-red-700 mb-4">
              Ocorreu um erro inesperado. O problema foi registrado e será investigado.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="text-xs bg-red-100 p-3 rounded border border-red-300 text-left overflow-auto max-h-40 mb-4">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Tentar Novamente
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Voltar ao Início
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Simple error boundary for specific sections
 */
export function SectionErrorBoundary({
  children,
  sectionName,
}: {
  children: ReactNode;
  sectionName: string;
}) {
  return (
    <ErrorBoundary
      name={sectionName}
      fallback={
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          <p className="font-medium">Erro ao carregar esta seção</p>
          <p className="text-sm">{sectionName}</p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
