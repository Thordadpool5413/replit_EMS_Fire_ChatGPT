import React, {useState, useSyncExternalStore} from 'react';
import {Download, RefreshCw, Smartphone, Wifi, WifiOff} from 'lucide-react';
import {applyPwaUpdate, getPwaState, installPwa, subscribePwa} from './lifecycle';
import './PwaControls.css';

export function PwaControls() {
  const state = useSyncExternalStore(subscribePwa, getPwaState, getPwaState);
  const [help, setHelp] = useState(false);
  return <section className="pwa-controls" aria-label="App installation and connectivity" data-testid="pwa-controls">
    <h3><Smartphone size={16} aria-hidden="true"/> App &amp; connection</h3>
    <p className="pwa-controls-status" role="status">
      {state.online ? <Wifi size={16} aria-hidden="true"/> : <WifiOff size={16} aria-hidden="true"/>}
      {state.online ? 'Online' : 'Offline — live sources unavailable'}
      {state.installed && <span>Installed app</span>}
    </p>
    {!state.online && <p>Previously opened, cached screens may still work. Maps and source lookups can require a connection. Local research stays on this device.</p>}
    {state.updateAvailable && <button type="button" onClick={applyPwaUpdate} data-testid="button-update-pwa"><RefreshCw size={16} aria-hidden="true"/> Update &amp; reload app</button>}
    {!state.installed && (state.installAvailable
      ? <button type="button" onClick={() => {void installPwa();}} data-testid="button-install-pwa"><Download size={16} aria-hidden="true"/> Install app</button>
      : <button type="button" onClick={() => setHelp(value => !value)} aria-expanded={help} data-testid="button-pwa-install-help"><Download size={16} aria-hidden="true"/> Add to Home Screen</button>)}
    {help && <div className="pwa-controls-help">
      <p><strong>iPhone / iPad:</strong> open this app in Safari, tap Share, then Add to Home Screen.</p>
      <p><strong>Android:</strong> open the browser menu, then Install app or Add to Home screen, when available.</p>
      <p>Installation depends on your browser. An embedded Preview may need to be opened in its own browser tab first.</p>
    </div>}
    {state.error && <p role="alert" className="pwa-controls-error">{state.error}</p>}
  </section>;
}

/** Connection and update notices stay in document flow, clear of phone navigation. */
export function PwaStatusBanner() {
  const state = useSyncExternalStore(subscribePwa, getPwaState, getPwaState);
  if (state.online && !state.updateAvailable) return null;
  return <aside className="pwa-status-banner" aria-label="App status">
    <p role="status">{state.online ? <RefreshCw size={16} aria-hidden="true"/> : <WifiOff size={16} aria-hidden="true"/>}
      {state.online ? 'An app update is ready. Save your work before updating.' : 'You’re offline. Cached records may be available; live maps and lookups need a connection.'}</p>
    {state.online && state.updateAvailable && <button type="button" onClick={applyPwaUpdate}>Update app</button>}
    {state.error && <p role="alert">{state.error}</p>}
  </aside>;
}
