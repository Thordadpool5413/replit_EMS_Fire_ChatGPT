import { useEffect, useState } from 'react';
import { LoaderCircle, RotateCw } from 'lucide-react';

export function WorkspaceLoadingState() {
  const [isTakingLonger, setIsTakingLonger] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsTakingLonger(true), 8000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <section
      className="pi-workspace-loading"
      data-testid="workspace-loading-state"
      aria-busy="true"
      aria-labelledby="workspace-loading-title"
    >
      <div className="pi-workspace-loading__surface">
        <div className="pi-workspace-loading__heading">
          <span className="pi-workspace-loading__icon" aria-hidden="true">
            <LoaderCircle className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none" />
          </span>
          <div className="min-w-0">
            <h2 id="workspace-loading-title" className="pi-workspace-loading__title">
              Loading workspace
            </h2>
            <p className="pi-workspace-loading__description" role="status" aria-live="polite">
              Preparing this view and its available data.
            </p>
          </div>
        </div>

        <div className="pi-workspace-loading__skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        {isTakingLonger && (
          <div className="pi-workspace-loading__slow" role="status" aria-live="polite">
            <span>This is taking longer than expected.</span>
            <button
              type="button"
              data-testid="button-reload-workspace"
              onClick={() => window.location.reload()}
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reload view
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
