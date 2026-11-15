export const OPPORTUNITIES_WORKSPACE_TABS = [
  { id: 'contracts', label: 'Contracts' },
  { id: 'grants', label: 'Fire grants' },
  { id: 'pulseiq', label: 'Regional priority' }
] as const;

export const TERRITORY_WORKSPACE_TABS = [
  { id: 'states_directory', label: 'Directory', aliases: ['geo'] },
  { id: 'google_maps', label: 'Agency locations', aliases: [] },
  { id: 'map', label: 'Fleet & response map', aliases: ['gis'] }
] as const;

export const FIELD_WORKSPACE_TABS = [
  { id: 'field', label: 'Routes & notes' },
  { id: 'tm_dashboard', label: 'Field dashboard' }
] as const;

export const SPECIALIST_WORKSPACE_TABS = [
  { id: 'knowledge', label: 'Clinical & competitive' },
  { id: 'claims', label: 'Medicare & public health' },
  { id: '3d_studio', label: 'Equipment viewer' },
  { id: 'gateway', label: 'Federal sources' }
] as const;

export const SYSTEM_WORKSPACE_TABS = [
  { id: 'data_health', label: 'Data health & sync' },
  { id: 'resilience', label: 'Backup & restore' }
] as const;

export const isOpportunitiesTab = (tab: string) =>
  OPPORTUNITIES_WORKSPACE_TABS.some((item) => item.id === tab);

export const isTerritoryTab = (tab: string) =>
  TERRITORY_WORKSPACE_TABS.some((item) => item.id === tab || item.aliases.includes(tab as never));

export const isTerritoryViewSelected = (viewId: string, activeTab: string) => {
  const view = TERRITORY_WORKSPACE_TABS.find((item) => item.id === viewId);
  return Boolean(view && (view.id === activeTab || view.aliases.includes(activeTab as never)));
};

export const isFieldWorkTab = (tab: string) =>
  FIELD_WORKSPACE_TABS.some((item) => item.id === tab);

export const isSpecialistTab = (tab: string) =>
  SPECIALIST_WORKSPACE_TABS.some((item) => item.id === tab);

export const isSystemTab = (tab: string) =>
  SYSTEM_WORKSPACE_TABS.some((item) => item.id === tab);

/** Stable route IDs retain existing deep links while presenting four daily workspaces. */
export const PRIMARY_WORKSPACES = [
  { id: 'home', label: 'Map', description: 'Explore states, counties, and agencies.' },
  { id: 'queue', label: 'Agencies', description: 'Research and manage your accounts.' },
  { id: 'field', label: 'Field Work', description: 'Plan visits, record notes, and follow up.' },
  { id: 'reports', label: 'Reports', description: 'Review opportunities and export your work.' },
] as const;
export function primaryWorkspaceFor(tab: string): string {
  if (tab === 'home' || isTerritoryTab(tab)) return 'home';
  if (tab === 'queue') return 'queue';
  if (isFieldWorkTab(tab)) return 'field';
  if (tab === 'settings' || isSystemTab(tab) || ['gateway', 'claims'].includes(tab)) return 'settings';
  return 'reports';
}
