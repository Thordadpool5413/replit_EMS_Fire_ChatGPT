import { isModuleLoadError, reloadApplication } from '../utils/moduleRecovery';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTab?: string;
  onReset?: () => void;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  recoveryMessage?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public handleReload = async () => {
    const online = navigator.onLine;
    const reloading = await reloadApplication({online,updateWorker:async()=>{
      if ('serviceWorker' in navigator) { const registration=await navigator.serviceWorker.getRegistration(); await registration?.update(); }
    },reload:()=>window.location.reload()});
    if(!reloading)this.setState({recoveryMessage:'You are offline. Reconnect before reloading this view. Saved device records remain available.'});
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const moduleFailure=isModuleLoadError(this.state.error);
      return (
        <div className="w-full min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-6 text-center shadow-lg">
            <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {moduleFailure?'An app file could not load':'This view could not load'}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              {moduleFailure?'This can happen after an app update or an interrupted download. Reconnect, save any unfinished work in other views, then reload the app. Reloading does not clear saved device records, queued changes, or drafts.':'Try opening the workspace again. This action does not clear saved records, queued changes, or visit drafts.'}
            </p>
            {this.state.error?.message && (
              <details className="mt-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400 text-left break-words">
                <summary>Technical details</summary>
                {this.state.error.message}
              </details>
            )}
            {this.state.recoveryMessage&&<p role="alert" className="text-xs mt-3">{this.state.recoveryMessage}</p>}
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={moduleFailure?this.handleReload:this.handleReset}
                className="px-4 py-2 rounded-xl bg-[#1E3A8A] hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{moduleFailure?'Reload app':this.props.onReset ? 'Return to map' : 'Try again'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
