type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{outcome: 'accepted' | 'dismissed'}> };
export type PwaState = { online: boolean; installed: boolean; installAvailable: boolean; updateAvailable: boolean; error: string };
let snapshot: PwaState = {online: true, installed: false, installAvailable: false, updateAvailable: false, error: ''};
const listeners = new Set<() => void>();
let promptEvent: InstallPrompt | null = null;
let registration: ServiceWorkerRegistration | null = null;
let started = false;
let unsavedReview = false;
const publish = (patch: Partial<PwaState>) => {
  snapshot = {...snapshot, ...patch};
  listeners.forEach(listener => listener());
};
export const subscribePwa = (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};};
export const getPwaState = () => snapshot;

/** Listeners live at entry startup, not in the optionally mounted More panel. */
export function startPwaLifecycle(production: boolean, baseUrl: string) {
  if(started) return;
  started = true;
  const viewport = window.visualViewport;
  let restingHeight = window.innerHeight;
  let restingWidth = window.innerWidth;
  if(viewport) {
    const syncViewport = () => {
      // Respect intentional pinch zoom; keyboard/layout changes happen at scale 1.
      if(viewport.scale !== 1) return;
      document.documentElement.style.setProperty('--app-visible-height', `${Math.round(viewport.height)}px`);
      const active = document.activeElement;
      const editing = Boolean(active?.matches('textarea, input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), [contenteditable="true"]'));
      if (window.innerWidth !== restingWidth) {
        restingWidth = window.innerWidth;
        restingHeight = window.innerHeight;
      }
      if (!editing) restingHeight = Math.max(restingHeight, window.innerHeight);
      // Android can resize both viewports; Safari generally resizes only the visual viewport.
      const obscured = Math.max(window.innerHeight - viewport.height, restingHeight - viewport.height);
      document.documentElement.dataset.mobileKeyboard = editing && obscured > 150 ? 'open' : 'closed';
    };
    syncViewport();
    viewport.addEventListener('resize', syncViewport);
    window.addEventListener('resize', syncViewport);
    document.addEventListener('focusin', syncViewport);
    document.addEventListener('focusout', () => window.setTimeout(syncViewport, 0));
  }
  const display = window.matchMedia('(display-mode: standalone)');
  const isInstalled = () => display.matches || Boolean((navigator as Navigator & {standalone?: boolean}).standalone);
  publish({online: navigator.onLine, installed: isInstalled()});
  window.addEventListener('online', () => publish({online: true}));
  window.addEventListener('offline', () => publish({online: false}));
  display.addEventListener('change', () => publish({installed: isInstalled()}));
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event as InstallPrompt;
    publish({installAvailable: true});
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    publish({installed: true, installAvailable: false});
  });
  window.addEventListener('agency-profile-review-dirty', event => {
    unsavedReview = Boolean((event as CustomEvent<boolean>).detail);
  });
  if(!production || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`${baseUrl}sw.js`, {scope: baseUrl, updateViaCache: 'none'})
    .then(reg => {
      registration = reg;
      const inspect = () => publish({updateAvailable: Boolean(reg.waiting && navigator.serviceWorker.controller)});
      inspect();
      reg.addEventListener('updatefound', () => {
        reg.installing?.addEventListener('statechange', inspect);
      });
      // Check again when returning to an installed app. Do not poll while hidden.
      document.addEventListener('visibilitychange', () => {
        if(document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {});
      });
    }).catch((error: unknown) => {
      console.error('PWA service worker registration failed:', error);
      publish({error: 'Offline setup could not finish. You can continue online and retry by reopening the app.'});
    });
}

export async function installPwa() {
  if(!promptEvent) return;
  const pending = promptEvent;
  promptEvent = null;
  publish({installAvailable: false, error: ''});
  try {
    await pending.prompt();
    // Acceptance is not proof of installation; appinstalled/display-mode owns that state.
    await pending.userChoice;
  } catch {
    publish({error: 'The install prompt could not open. Use your browser’s Add to Home Screen option.'});
  }
}

export function applyPwaUpdate() {
  if(!registration?.waiting) return;
  if(unsavedReview) {
    publish({error: 'Save or discard your unfinished fact review before updating.'});
    return;
  }
  if(!window.confirm('Save any unfinished work first. Update and reload this app now?')) return;
  publish({error: ''});
  const timeout = window.setTimeout(() => {
    navigator.serviceWorker.removeEventListener('controllerchange', reload);
    publish({error: 'The update did not activate yet. Reopen the app after saving your work.'});
  }, 12000);
  const reload = () => {
    window.clearTimeout(timeout);
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', reload, {once: true});
  registration.waiting.postMessage({type: 'ACTIVATE_UPDATE'});
}
