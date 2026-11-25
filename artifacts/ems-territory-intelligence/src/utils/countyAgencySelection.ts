import type { Agency } from "../types";
import { matchesAgencyCounty } from "./countyIdentity";

/** County views include every saved account at that county, not only Census-listed cities. */
export function filterSavedAgencyRecordsForJurisdiction(
  agencies: Agency[],
  stateCode: string,
  countyName?: string,
  cityName?: string,
): Agency[] {
  const state = stateCode.trim().toUpperCase();
  const county = countyName?.trim();
  const city = cityName?.trim().toLocaleLowerCase();

  return agencies.filter((agency) =>
    agency.stateCode?.trim().toUpperCase() === state &&
    (!county || matchesAgencyCounty(agency, county)) &&
    (!city || agency.city?.trim().toLocaleLowerCase() === city),
  );
}
