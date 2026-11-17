import type { CountyHealthRecord } from '../types';
export const COUNTY_PLANNING_FIELDS = ['population','seniorPopPct','medianIncome','povertyRatePct','annualEmergencyTransports','annualCardiacArrestIncidents','averageTransportMinutes','primaryCathLabDistanceMiles','activeEmsAgencies'] as const;
type PlanningValues = { [K in typeof COUNTY_PLANNING_FIELDS[number]]: number };
/** Missing regional inputs must stay unavailable, never become zero-valued facts. */
export function hasCountyPlanningInputs<T extends CountyHealthRecord>(county: T | undefined): county is T & PlanningValues {
  return !!county && COUNTY_PLANNING_FIELDS.every(key => typeof county[key] === 'number' && Number.isFinite(county[key]));
}
