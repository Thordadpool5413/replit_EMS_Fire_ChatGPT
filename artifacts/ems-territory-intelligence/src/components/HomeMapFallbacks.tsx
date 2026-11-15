import React from 'react';

export function HomeMapUnavailableFallback({ onBrowseDirectory }: { onBrowseDirectory: () => void }) {
  return (
    <div className="home-map-unavailable" role="alert">
      <strong>The national map is unavailable.</strong>
      <span>Agency records remain accessible in the directory while map geometry is unavailable.</span>
      <button type="button" className="workspace-button" onClick={onBrowseDirectory}>
        Browse agency directory
      </button>
    </div>
  );
}

export function HomeMapFailureFallback({ onBrowseDirectory }: { onBrowseDirectory: () => void }) {
  return (
    <div className="home-map-failure-fallback" role="alert">
      <h2>The map could not be displayed</h2>
      <p>Agency information is still available in the directory.</p>
      <button type="button" className="workspace-button" onClick={onBrowseDirectory}>
        Browse agency directory
      </button>
    </div>
  );
}

export function TerritoryMapFailureFallback({ title }: { title: string }) {
  return (
    <div className="territory-map-failure" role="alert">
      <strong>{title}</strong>
      <span>The map is unavailable. County and agency records remain accessible below.</span>
      <button
        type="button"
        className="workspace-text-button"
        onClick={() => {
          const directory = document.getElementById('county-directory') ??
            document.querySelector('[data-testid="territory-results-summary"]');
          directory?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      >
        Go to directory
      </button>
    </div>
  );
}
