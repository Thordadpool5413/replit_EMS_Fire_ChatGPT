import React, { useState } from 'react';
import {
  Activity,
  Bell,
  Bookmark,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  Database,
  Download,
  Globe2,
  Home,
  Layers3,
  MapPin,
  Menu,
  Moon,
  MoreHorizontal,
  Navigation,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Syringe,
  TrendingUp,
  Truck,
  X,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  BriefcaseBusiness,
} from 'lucide-react';
import brandLogo from './assets/nicks_ems_logo_1792367124466.jpg';
import './_group.css';
import './Simplified.css';

type Destination = 'home' | 'agencies' | 'opportunities' | 'territory' | 'field-work' | 'specialist' | 'system';
type UtilityPanel = 'search' | 'strategy' | 'alerts' | 'help' | 'install' | 'sync' | null;

const destinations: { id: Destination; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'agencies', label: 'Agencies', icon: Building2 },
  { id: 'opportunities', label: 'Opportunities', icon: TrendingUp },
  { id: 'territory', label: 'Territory', icon: Globe2 },
  { id: 'field-work', label: 'Field Work', icon: BriefcaseBusiness },
];

const specialtyTools = [
  { label: 'Clinical & competitive', icon: Activity },
  { label: 'Medicare & public health', icon: Syringe },
  { label: 'Equipment viewer', icon: Truck },
  { label: 'Federal sources', icon: Database },
];

const mapLayers = [
  'Agency directory records',
  'Agency-profile ambulance total',
  'Agency-profile fire-engine total',
  'PulseIQ estimate · modeled average',
  'Cardiac survival estimate (%)',
  'EMS transit estimate (minutes)',
];

const mapLayerGradients: Record<string, string> = {
  'Agency directory records': 'linear-gradient(to right,#DDF5FF,#A8E4F5,#62C9E7,#249FCB,#126B98)',
  'Agency-profile ambulance total': 'linear-gradient(to right,#DDF5FF,#A8E4F5,#62C9E7,#249FCB,#126B98)',
  'Agency-profile fire-engine total': 'linear-gradient(to right,#DDF5FF,#A8E4F5,#62C9E7,#249FCB,#126B98)',
  'PulseIQ estimate · modeled average': 'linear-gradient(to right,#F3E8FF,#D8B4FE,#B174F0,#8B43D0,#612B9B)',
  'Cardiac survival estimate (%)': 'linear-gradient(to right,#FF1744,#FF9100,#FFEA00,#AEEA00,#00E676)',
  'EMS transit estimate (minutes)': 'linear-gradient(to right,#00E676,#AEEA00,#FFEA00,#FF9100,#FF1744)',
};

export const suggestedActions = [
  'Apply this hierarchy to the production shell',
  'Review the mobile toolbar',
  'Check profile action visibility',
];

export const previewMetadata = { suggestedActions };

export function Simplified() {
  const [active, setActive] = useState<Destination>('home');
  const [profileOpen, setProfileOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>(null);
  const [dark, setDark] = useState(false);
  const [saved, setSaved] = useState(false);
  const [onRoute, setOnRoute] = useState(false);
  const [mapLayer, setMapLayer] = useState(mapLayers[0]);
  const [mapZoom, setMapZoom] = useState(100);
  const [providerScope, setProviderScope] = useState<'all' | 'ems' | 'fire'>('all');
  const [mapRegion, setMapRegion] = useState('All regions');
  const [query, setQuery] = useState('');
  const [profileSection, setProfileSection] = useState<'overview' | 'details'>('overview');

  const goTo = (destination: Destination) => {
    setActive(destination);
    setProfileOpen(false);
    setToolsOpen(false);
    setUtilityPanel(null);
  };

  const openUtility = (panel: UtilityPanel) => {
    setUtilityPanel((current) => current === panel ? null : panel);
    setToolsOpen(false);
  };

  const activeTitle = profileOpen
    ? 'Agency profile'
    : destinations.find((item) => item.id === active)?.label ?? 'Workspace';

  return (
    <div className={`ems-simplified ${dark ? 'is-dark' : ''}`}>
      <aside className="ems-sidebar" aria-label="Primary navigation">
        <button className="ems-brand" type="button" onClick={() => goTo('home')} aria-label="EMS and Fire Territory Intelligence home">
          <img src={brandLogo} alt="EMS and Fire Territory Intelligence" />
          <span><strong>Territory</strong><small>EMS &amp; Fire intelligence</small></span>
        </button>

        <div className="ems-scope">
          <span className="ems-overline">Provider scope</span>
          <div className="ems-segment" role="group" aria-label="Provider scope">
            {(['all', 'ems', 'fire'] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                className={providerScope === scope ? 'selected' : ''}
                aria-pressed={providerScope === scope}
                onClick={() => setProviderScope(scope)}
              >
                {scope === 'all' ? 'All' : scope === 'ems' ? 'EMS' : 'Fire'}
              </button>
            ))}
          </div>
        </div>

        <nav className="ems-nav" aria-label="Main workspaces">
          <span className="ems-overline">Workspaces</span>
          {destinations.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`ems-nav-item ${active === id && !profileOpen ? 'active' : ''}`}
              onClick={() => goTo(id)}
              aria-current={active === id && !profileOpen ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          <div className="ems-tools-group">
            <span className="ems-overline">More / Tools</span>
            <button
              className={`ems-nav-item ${active === 'specialist' ? 'active' : ''}`}
              type="button"
              onClick={() => goTo('specialist')}
              aria-current={active === 'specialist' ? 'page' : undefined}
            >
              <Layers3 aria-hidden="true" /><span>Specialist tools</span>
            </button>
            <button
              className={`ems-nav-item ${active === 'system' ? 'active' : ''}`}
              type="button"
              onClick={() => goTo('system')}
              aria-current={active === 'system' ? 'page' : undefined}
            >
              <ShieldCheck aria-hidden="true" /><span>Data &amp; system</span>
            </button>
          </div>
        </nav>

        <div className="ems-sidebar-utilities">
          <button type="button" onClick={() => openUtility('search')}><Search /><span>Search workspace</span><kbd>⌘ K</kbd></button>
          <button type="button" onClick={() => openUtility('strategy')}><Sparkles /><span>Strategy AI</span></button>
          <button type="button" onClick={() => openUtility('help')}><CircleHelp /><span>Help &amp; sources</span><ChevronDown className="ems-trailing" /></button>
        </div>
        <button className="ems-connectivity" type="button" onClick={() => openUtility('sync')}>
          <span className="ems-connectivity-dot" /><span>Local workspace</span><RefreshCw aria-hidden="true" />
        </button>
      </aside>

      <header className="ems-mobile-header">
        <button className="ems-mobile-brand" type="button" onClick={() => goTo('home')} aria-label="Go to Home">
          <img src={brandLogo} alt="" />
          <span><strong>Territory</strong><small>EMS &amp; Fire</small></span>
        </button>
        <div className="ems-mobile-actions">
          <button type="button" onClick={() => openUtility('search')} aria-label="Search"><Search /></button>
          <button type="button" onClick={() => setToolsOpen((value) => !value)} aria-label="Open workspace tools" aria-expanded={toolsOpen}><Menu /></button>
        </div>
      </header>

      <main className="ems-main">
        <div className="ems-context-bar">
          <div className="ems-breadcrumb">
            <span>Workspace</span><span className="ems-slash">/</span>
            <strong>{profileOpen ? 'Agencies' : activeTitle}</strong>
            {profileOpen && <><span className="ems-slash">/</span><strong>Sample agency</strong></>}
          </div>
          <div className="ems-context-actions">
            <button type="button" className="ems-ai-action" onClick={() => openUtility('strategy')}><Sparkles /> Strategy AI</button>
            <button type="button" className="ems-icon-action" onClick={() => openUtility('alerts')} aria-label="Open alerts"><Bell /></button>
            <button type="button" className="ems-icon-action" onClick={() => setDark((value) => !value)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>{dark ? <Sun /> : <Moon />}</button>
            <button type="button" className="ems-icon-action" onClick={() => openUtility('help')} aria-label="Help and sources"><CircleHelp /></button>
            <button type="button" className="ems-icon-action" onClick={() => openUtility('install')} aria-label="Install app"><Download /></button>
            <button type="button" className="ems-sync-action" onClick={() => openUtility('sync')}><RefreshCw /><span>Sync</span></button>
          </div>
        </div>

        {active === 'home' && !profileOpen && (
          <section className="ems-home-map" aria-label="Territory map workspace">
            <div className="ems-map-topline">
              <div className="ems-map-title">
                <span className="ems-map-icon"><Compass aria-hidden="true" /></span>
                <div><h1>Territory map</h1><p>Explore EMS and fire coverage across the United States.</p></div>
              </div>
              <label className="ems-layer-control">
                <span>Map layer</span>
                <select aria-label="Choose map layer" value={mapLayer} onChange={(event) => setMapLayer(event.target.value)}>
                  {mapLayers.map((layer) => <option key={layer}>{layer}</option>)}
                </select>
              </label>
            </div>
            <div className="ems-map-viewport">
              <div className="ems-map-utilityline">
                <div className="ems-region-selector" aria-label="Map region filters">
                  {['All regions', 'Northeast', 'Midwest', 'South', 'West'].map((region) => (
                    <button
                      key={region}
                      className={mapRegion === region ? 'active' : ''}
                      type="button"
                      aria-pressed={mapRegion === region}
                      onClick={() => setMapRegion(region)}
                    >
                      {region}
                    </button>
                  ))}
                </div>
                <div className="ems-map-zoom">
                  <button type="button" aria-label="Zoom out" onClick={() => setMapZoom((zoom) => Math.max(80, zoom - 10))}><ZoomOut /></button>
                  <span aria-live="polite">{mapZoom}%</span>
                  <button type="button" aria-label="Zoom in" onClick={() => setMapZoom((zoom) => Math.min(140, zoom + 10))}><ZoomIn /></button>
                </div>
              </div>
              <div className="ems-map-art" role="img" aria-label="Illustrative United States map. Territory records are not included in this sample preview.">
                <div className="ems-map-grid" aria-hidden="true" />
                <svg className="ems-us-map" viewBox="0 0 860 470" style={{ transform: `scale(${mapZoom / 100})` }} aria-hidden="true">
                  <defs>
                    <pattern id="ems-missing-pattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                      <rect width="8" height="8" fill="#172A3D" />
                      <path d="M 0 0 L 0 8" stroke="#8299AF" strokeWidth="2" />
                    </pattern>
                    <clipPath id="ems-map-clip">
                      <path d="M82 109 111 94 153 101 174 80 212 92 241 78 269 94 302 75 339 92 375 83 404 97 430 90 460 104 485 91 512 99 535 85 564 102 599 93 630 108 652 99 674 117 707 120 730 142 755 152 749 175 764 195 750 221 737 240 720 250 710 277 685 292 667 317 643 322 622 348 593 353 578 369 554 360 532 379 505 368 485 385 461 372 440 386 421 374 397 388 370 379 348 394 323 381 300 389 281 371 256 374 238 355 217 358 207 337 187 333 174 315 151 310 140 288 118 277 125 251 110 234 117 211 99 198 107 176 90 159 100 140 88 126Z" />
                    </clipPath>
                  </defs>
                  <path d="M82 109 111 94 153 101 174 80 212 92 241 78 269 94 302 75 339 92 375 83 404 97 430 90 460 104 485 91 512 99 535 85 564 102 599 93 630 108 652 99 674 117 707 120 730 142 755 152 749 175 764 195 750 221 737 240 720 250 710 277 685 292 667 317 643 322 622 348 593 353 578 369 554 360 532 379 505 368 485 385 461 372 440 386 421 374 397 388 370 379 348 394 323 381 300 389 281 371 256 374 238 355 217 358 207 337 187 333 174 315 151 310 140 288 118 277 125 251 110 234 117 211 99 198 107 176 90 159 100 140 88 126Z" fill="url(#ems-missing-pattern)" stroke="#8EA5B9" strokeWidth="2.5" />
                  <g clipPath="url(#ems-map-clip)" fill="none" stroke="#7590A5" strokeOpacity=".56" strokeWidth="1.4">
                    <path d="M146 78v270M185 76v280M224 74v290M263 70v310M302 70v315M341 76v315M380 75v320M419 78v320M458 78v320M497 78v320M536 74v320M575 78v310M614 84v300M653 90v280M692 100v240M731 125v150" />
                    <path d="M80 135q340 16 680 2M83 170q330 18 680 10M96 207q320 8 665 4M106 244q320 10 628 4M124 280q300 14 575 6M150 316q265 12 484 3M200 350q220 8 390 2" />
                  </g>
                  <path d="M82 109 111 94 153 101 174 80 212 92 241 78 269 94 302 75 339 92 375 83 404 97 430 90 460 104 485 91 512 99 535 85 564 102 599 93 630 108 652 99 674 117 707 120 730 142 755 152 749 175 764 195 750 221 737 240 720 250 710 277 685 292 667 317 643 322 622 348 593 353 578 369 554 360 532 379 505 368 485 385 461 372 440 386 421 374 397 388 370 379 348 394 323 381 300 389 281 371 256 374 238 355 217 358 207 337 187 333 174 315 151 310 140 288 118 277 125 251 110 234 117 211 99 198 107 176 90 159 100 140 88 126Z" fill="none" stroke="#C5D4DD" strokeWidth="2.2" />
                  <g className="ems-map-inset">
                    <rect x="94" y="382" width="128" height="58" rx="6" />
                    <text x="107" y="404">ALASKA</text>
                    <path d="m111 419 17-10 14 7 15-4 17 10-11 9-20-3-15 4Z" />
                    <rect x="235" y="382" width="88" height="58" rx="6" />
                    <text x="249" y="404">HAWAII</text>
                    <circle cx="266" cy="420" r="3" /><circle cx="282" cy="425" r="3" /><circle cx="299" cy="418" r="3" />
                  </g>
                </svg>
                <div className="ems-map-note"><MapPin /> Sample map view <span>•</span> Territory data not shown</div>
                <div className="ems-map-legend" aria-label="Map legend">
                  <span>{mapLayer}</span>
                  <span className="ems-legend-scale"><i style={{ background: mapLayerGradients[mapLayer] }} /> Less <b /> More</span>
                  <span className="ems-legend-missing"><i /> Not reported</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {active === 'agencies' && !profileOpen && (
          <section className="ems-content-page">
            <div className="ems-page-heading"><div><span className="ems-eyebrow">Workspace</span><h1>Agencies</h1><p>Review agency records and open a profile for more context.</p></div><button className="ems-outline-button" type="button" onClick={() => openUtility('search')}><Search /> Find an agency</button></div>
            <div className="ems-table-shell">
              <div className="ems-table-heading"><span>Agency directory</span><span className="ems-sample-label">Sample record</span></div>
              <div className="ems-agency-row">
                <div className="ems-agency-mark"><Building2 /></div>
                <div className="ems-agency-name"><strong>Sample EMS &amp; Fire Agency</strong><span>Location not reported · Agency type not reported</span></div>
                <span className="ems-not-reported">Details not reported</span>
                <button className="ems-open-profile" type="button" onClick={() => { setProfileOpen(true); setProfileSection('overview'); }}>Open profile <span aria-hidden="true">→</span></button>
              </div>
            </div>
          </section>
        )}

        {profileOpen && active === 'agencies' && (
          <section className="ems-content-page ems-profile-page">
            <button className="ems-back-link" type="button" onClick={() => setProfileOpen(false)}>← <span>Back to Agencies</span></button>
            <div className="ems-profile-summary">
              <div className="ems-profile-mark"><Building2 /></div>
              <div className="ems-profile-identity">
                <span className="ems-eyebrow">Sample agency profile</span>
                <h1>Sample EMS &amp; Fire Agency</h1>
                <p><MapPin /> Location not reported <span className="ems-profile-separator">·</span> Agency type not reported</p>
              </div>
              <div className="ems-profile-actions">
                <button type="button" className={`ems-outline-button ${saved ? 'is-selected' : ''}`} onClick={() => setSaved((value) => !value)} aria-pressed={saved}><Bookmark />{saved ? 'Saved' : 'Save agency'}</button>
                <button type="button" className={`ems-primary-button ${onRoute ? 'is-selected' : ''}`} onClick={() => setOnRoute((value) => !value)} aria-pressed={onRoute}><Navigation />{onRoute ? 'On field route' : 'Add to field route'}</button>
              </div>
            </div>
            <div className="ems-profile-tabs" role="tablist" aria-label="Agency profile sections">
              <button type="button" role="tab" aria-selected={profileSection === 'overview'} className={profileSection === 'overview' ? 'selected' : ''} onClick={() => setProfileSection('overview')}>Overview</button>
              <button type="button" role="tab" aria-selected={profileSection === 'details'} className={profileSection === 'details' ? 'selected' : ''} onClick={() => setProfileSection('details')}>Technical &amp; sources</button>
            </div>
            {profileSection === 'overview' ? (
              <div className="ems-profile-overview">
                <section className="ems-profile-section">
                  <div className="ems-section-heading"><div><span className="ems-eyebrow">At a glance</span><h2>Agency summary</h2></div><span className="ems-sample-label">Neutral sample</span></div>
                  <div className="ems-summary-grid">
                    <div><span>Service area</span><strong>Not reported</strong></div>
                    <div><span>Agency category</span><strong>Not reported</strong></div>
                    <div><span>Primary contact</span><strong>Not reported</strong></div>
                  </div>
                </section>
                <section className="ems-profile-section">
                  <div className="ems-section-heading"><div><span className="ems-eyebrow">Record context</span><h2>Profile details</h2></div></div>
                  <p className="ems-context-copy">This sample profile shows the intended reading order. Agency facts, source evidence, and operational details remain grouped below the summary and retain their reported or missing-data treatment.</p>
                  <button className="ems-text-link" type="button" onClick={() => setProfileSection('details')}>View technical &amp; source details <span aria-hidden="true">→</span></button>
                </section>
              </div>
            ) : (
              <div className="ems-profile-overview">
                <section className="ems-profile-section">
                  <div className="ems-section-heading"><div><span className="ems-eyebrow">Record details</span><h2>Technical information</h2></div></div>
                  <div className="ems-details-list">
                    <div><span>Provider identifier</span><strong>Not reported</strong></div>
                    <div><span>Fleet details</span><strong>Not reported</strong></div>
                    <div><span>Operational measures</span><strong>Not reported</strong></div>
                  </div>
                </section>
                <section className="ems-profile-section">
                  <div className="ems-section-heading"><div><span className="ems-eyebrow">Evidence</span><h2>Sources &amp; provenance</h2></div><button type="button" className="ems-outline-button" onClick={() => openUtility('help')}><CircleHelp /> Help &amp; sources</button></div>
                  <p className="ems-context-copy">No source records are included in this neutral sample profile.</p>
                </section>
              </div>
            )}
          </section>
        )}

        {active !== 'home' && active !== 'agencies' && (
          <section className="ems-content-page">
            <div className="ems-page-heading"><div><span className="ems-eyebrow">Workspace</span><h1>{activeTitle}</h1><p>Workspace navigation preview.</p></div></div>
            <div className="ems-empty-workspace"><div className="ems-empty-icon"><Layers3 /></div><h2>{activeTitle}</h2><p>This shell mockup focuses on navigation hierarchy and profile context.</p></div>
          </section>
        )}
      </main>

      <nav className="ems-mobile-nav" aria-label="Mobile primary navigation">
        {destinations.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => goTo(id)} className={active === id && !profileOpen ? 'active' : ''} aria-current={active === id && !profileOpen ? 'page' : undefined}>
            <Icon aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
        <button type="button" className={toolsOpen || active === 'specialist' || active === 'system' ? 'active' : ''} onClick={() => setToolsOpen((value) => !value)} aria-expanded={toolsOpen} aria-controls="ems-mobile-tools"><MoreHorizontal /><span>More</span></button>
      </nav>

      {toolsOpen && (
        <>
          <button className="ems-mobile-scrim" type="button" aria-label="Close tools menu" onClick={() => setToolsOpen(false)} />
          <section id="ems-mobile-tools" className="ems-tools-sheet" aria-label="More and tools">
            <div className="ems-sheet-heading"><div><span className="ems-eyebrow">Secondary navigation</span><h2>More / Tools</h2></div><button type="button" onClick={() => setToolsOpen(false)} aria-label="Close tools"><X /></button></div>
            <div className="ems-mobile-tool-groups">
              <div><span>Specialist tools</span>{specialtyTools.map(({ label, icon: Icon }) => <button type="button" key={label} onClick={() => goTo('specialist')}><Icon />{label}</button>)}</div>
              <div><span>Data &amp; system</span><button type="button" onClick={() => goTo('system')}><Activity />Data health &amp; sync</button><button type="button" onClick={() => goTo('system')}><ShieldCheck />Backup &amp; restore</button></div>
            </div>
            <div className="ems-mobile-utility-section">
              <span>Workspace utilities</span>
              <div className="ems-mobile-utility-grid">
                <button type="button" onClick={() => openUtility('strategy')}><Sparkles />Strategy AI</button>
                <button type="button" onClick={() => openUtility('alerts')}><Bell />Alerts</button>
                <button type="button" onClick={() => { setDark((value) => !value); setToolsOpen(false); }}><Moon />Theme</button>
                <button type="button" onClick={() => openUtility('help')}><CircleHelp />Help &amp; sources</button>
                <button type="button" onClick={() => openUtility('install')}><Download />Install app</button>
                <button type="button" onClick={() => openUtility('sync')}><RefreshCw />Sync</button>
              </div>
            </div>
          </section>
        </>
      )}

      {utilityPanel && (
        <>
          <button className="ems-panel-scrim" type="button" onClick={() => setUtilityPanel(null)} aria-label="Close utility panel" />
          <section className="ems-utility-panel" role="dialog" aria-modal="true" aria-labelledby="ems-utility-title">
            <div className="ems-utility-heading"><div><span className="ems-eyebrow">Workspace utility</span><h2 id="ems-utility-title">{utilityPanel === 'search' ? 'Search' : utilityPanel === 'strategy' ? 'Strategy AI' : utilityPanel === 'alerts' ? 'Alerts' : utilityPanel === 'help' ? 'Help & sources' : utilityPanel === 'install' ? 'Install app' : 'Sync workspace'}</h2></div><button type="button" onClick={() => setUtilityPanel(null)} aria-label="Close panel"><X /></button></div>
            {utilityPanel === 'search' ? (
              <div className="ems-search-body"><label htmlFor="ems-workspace-search">Search agencies and territory</label><div className="ems-search-input"><Search /><input id="ems-workspace-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Agency, city, ZIP, or identifier" /></div><button className="ems-search-result" type="button" onClick={() => { goTo('agencies'); setProfileOpen(true); setUtilityPanel(null); }}><Building2 /><span><strong>Sample EMS &amp; Fire Agency</strong><small>Open sample agency profile</small></span><span aria-hidden="true">→</span></button>{query && <p className="ems-panel-note">Preview search is limited to the sample record.</p>}</div>
            ) : utilityPanel === 'strategy' ? (
              <div className="ems-utility-copy"><Sparkles /><p>Strategy AI is available from this workspace shell. This preview does not send a prompt or connect to a service.</p><button type="button" className="ems-outline-button" onClick={() => setUtilityPanel(null)}>Return to workspace</button></div>
            ) : utilityPanel === 'alerts' ? (
              <div className="ems-utility-copy"><Bell /><p>Alert center preview. No sample alerts are included.</p></div>
            ) : utilityPanel === 'help' ? (
              <div className="ems-help-list"><button type="button" onClick={() => setUtilityPanel(null)}><CircleHelp /><span><strong>Quick start</strong><small>Workspace guidance</small></span></button><button type="button" onClick={() => setUtilityPanel(null)}><Database /><span><strong>Data lineage &amp; sources</strong><small>Source and evidence context</small></span></button></div>
            ) : utilityPanel === 'install' ? (
              <div className="ems-utility-copy"><Download /><p>Install options are provided by your browser when available.</p><button type="button" className="ems-outline-button" onClick={() => setUtilityPanel(null)}>Done</button></div>
            ) : (
              <div className="ems-utility-copy"><RefreshCw /><p>Sync controls are available here. This mockup does not change or transmit workspace data.</p><button type="button" className="ems-outline-button" onClick={() => setUtilityPanel(null)}><Check /> Got it</button></div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
