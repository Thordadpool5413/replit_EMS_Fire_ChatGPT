import type { Agency } from '../types';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface NearbyAgencyMatch {
  agency: Agency;
  distanceMiles: number;
}

const isValidCoordinate = (coordinate: Coordinates): boolean =>
  Number.isFinite(coordinate.lat) &&
  Math.abs(coordinate.lat) <= 90 &&
  Number.isFinite(coordinate.lng) &&
  Math.abs(coordinate.lng) <= 180;

const isMappedAgencyCoordinate = (coordinate: Coordinates): boolean =>
  isValidCoordinate(coordinate) && !(coordinate.lat === 0 && coordinate.lng === 0);

export const distanceMilesBetween = (from: Coordinates, to: Coordinates): number => {
  const earthRadiusMiles = 3958.8;
  const latitudeDelta = (to.lat - from.lat) * Math.PI / 180;
  const longitudeDelta = (to.lng - from.lng) * Math.PI / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(from.lat * Math.PI / 180) *
      Math.cos(to.lat * Math.PI / 180) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

/** Ranks only agencies with valid mapped coordinates; distance is straight-line, not drive time. */
export const findNearbyAgencies = (
  agencies: Agency[],
  userLocation: Coordinates | null,
  radiusMiles: number,
): NearbyAgencyMatch[] => {
  if (!userLocation || !isValidCoordinate(userLocation) || !Number.isFinite(radiusMiles) || radiusMiles < 0) {
    return [];
  }

  return agencies
    .filter((agency) => isMappedAgencyCoordinate({ lat: agency.latitude, lng: agency.longitude }))
    .map((agency) => ({
      agency,
      distanceMiles: distanceMilesBetween(userLocation, {
        lat: agency.latitude,
        lng: agency.longitude,
      }),
    }))
    .filter((match) => match.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles || a.agency.name.localeCompare(b.agency.name));
};
