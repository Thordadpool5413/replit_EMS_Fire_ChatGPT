export type ArchivedStation = {
  sourceId: number;
  name: string;
  address: string;
  stationId?: string;
  date?: string;
  phone?: string;
  figures: Record<string, number>;
};
export const stationHistorySource =
  'https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/Critical_Infrastructure_Map_Service/FeatureServer/12';
export async function loadStationHistory(state: string) {
  const res = await fetch(
    (import.meta.env?.BASE_URL ?? '/') + 'data/providers/stations-' + state + '.json',
    { signal: AbortSignal.timeout(20000) },
  );
  if (!res.ok) throw Error('Archived station contacts unavailable');
  return (await res.json()) as Record<string, ArchivedStation[]>;
}
