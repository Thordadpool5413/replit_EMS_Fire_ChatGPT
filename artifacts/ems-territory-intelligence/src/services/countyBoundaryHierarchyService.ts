import { gunzipSync, strFromU8 } from 'fflate';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agency } from '../types';
import { ALL_NATIONWIDE_COUNTIES, ComprehensiveCountyRecord, CityBoundaryRecord } from '../data/allCountiesDatabase';
import { ALL_50_STATES_SUMMARIES } from '../data/nationalGeographicData';
import { hasCompleteVerifiedDirectoryProfile } from '../data/providerIdentity';
import { territoryEngine } from './territoryIntelligenceEngine';

export interface GeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface CountyBoundaryGeoJsonFeature {
  type: 'Feature';
  id: string;
  properties: {
    GEOID: string;
    STATE: string;
    STATE_CODE: string;
    COUNTY: string;
    NAME: string;
    COUNTY_NAME: string;
    COUNTY_SEAT: string;
    LSAD: string;
    CENSUSAREA: number;
    CENTLAT: number;
    CENTLON: number;
    BBOX: [number, number, number, number];
    CITIES_COUNT: number;
  };
  geometry: GeoJsonGeometry;
}

export interface BoundarySourceInfo {
  source: string;
  vintage: string;
  retrievedAt: string;
  isFallback: boolean;
}

export interface CityJurisdictionNode {
  cityName: string;
  countyFips: string;
  countyName: string;
  stateCode: string;
  stateName: string;
  stateFips: string;
  isCountySeat: boolean;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  providers: Agency[];
}

export interface CountyBoundaryNode {
  countyFips: string;
  stateFips: string;
  countyAnsi: string;
  countyName: string;
  rawName: string;
  stateCode: string;
  stateName: string;
  countySeat: string;
  centroid: {
    lat: number;
    lng: number;
  };
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  landAreaSqMiles: number;
  primaryZipCodes: string[];
  geometry: GeoJsonGeometry | null;
  boundarySource: string;
  citiesByName: Record<string, CityJurisdictionNode>;
  citiesList: CityJurisdictionNode[];
  countyRecord: ComprehensiveCountyRecord;
}

export interface StateHierarchyNode {
  stateCode: string;
  stateName: string;
  stateFips: string;
  region: 'Northeast' | 'Midwest' | 'South' | 'West';
  bbox: [number, number, number, number];
  totalLandAreaSqMiles: number;
  countiesByFips: Record<string, CountyBoundaryNode>;
  countiesByName: Record<string, CountyBoundaryNode>;
  countiesList: CountyBoundaryNode[];
  totalCitiesCount: number;
  boundarySourceInfo?: BoundarySourceInfo;
}

export interface NationalGeographicHierarchy {
  statesByCode: Record<string, StateHierarchyNode>;
  statesList: StateHierarchyNode[];
  countiesByFips: Record<string, CountyBoundaryNode>;
  totalStates: number;
  totalCounties: number;
  totalCities: number;
}

export interface SvgProjectedCounty {
  countyFips: string;
  countyName: string;
  countySeat: string;
  stateCode: string;
  landAreaSqMiles: number;
  citiesCount: number;
  svgPath: string;
  labelX: number;
  labelY: number;
  node: CountyBoundaryNode;
}

export interface SvgProjectedCityPin {
  cityName: string;
  zipCode: string;
  isCountySeat: boolean;
  latitude: number;
  longitude: number;
  svgX: number;
  svgY: number;
  providersCount: number;
}

class CountyBoundaryHierarchyService {
  private hierarchy: NationalGeographicHierarchy | null = null;
  private stateFeaturesCache: Map<string, CountyBoundaryGeoJsonFeature[]> = new Map();
  private inFlightStateRequests: Map<string, Promise<CountyBoundaryGeoJsonFeature[]>> = new Map();

  /**
   * Build the complete 3-tier State -> County (with real Census FIPS, bbox, centroid, landArea) -> City hierarchy
   */
  public getHierarchy(agencies?: Agency[]): NationalGeographicHierarchy {
    if (this.hierarchy) {
      if (agencies !== undefined) this.mapProvidersToHierarchy(agencies);
      return this.hierarchy;
    }

    const statesByCode: Record<string, StateHierarchyNode> = {};
    const countiesByFips: Record<string, CountyBoundaryNode> = {};
    let totalCities = 0;

    for (const [sc, summary] of Object.entries(ALL_50_STATES_SUMMARIES)) {
      statesByCode[sc] = {
        stateCode: sc,
        stateName: summary.state,
        stateFips: summary.fips,
        region: summary.region,
        bbox: [180, 90, -180, -90],
        totalLandAreaSqMiles: 0,
        countiesByFips: {},
        countiesByName: {},
        countiesList: [],
        totalCitiesCount: 0,
      };
    }

    for (const c of ALL_NATIONWIDE_COUNTIES) {
      const sc = c.stateCode.toUpperCase();
      const stNode = statesByCode[sc];
      if (!stNode) continue;

      const citiesByName: Record<string, CityJurisdictionNode> = {};
      const citiesList: CityJurisdictionNode[] = [];

      const rawCityRecords: CityBoundaryRecord[] =
        c.cityRecords && c.cityRecords.length > 0
          ? c.cityRecords
          : (c.cities || [c.countySeat]).map((name, idx) => ({
              name,
              zipCode: c.primaryZipCodes?.[idx],
              isCountySeat: name.toLowerCase() === (c.countySeat || '').toLowerCase(),
            }));

      for (const cr of rawCityRecords) {
        const cityNode: CityJurisdictionNode = {
          cityName: cr.name,
          countyFips: c.countyFips,
          countyName: c.countyName,
          stateCode: sc,
          stateName: c.stateName,
          stateFips: c.stateFips || stNode.stateFips,
          isCountySeat: cr.isCountySeat,
          zipCode: cr.zipCode || undefined,
          latitude: cr.latitude,
          longitude: cr.longitude,
          providers: [],
        };
        citiesByName[cr.name.toLowerCase()] = cityNode;
        citiesList.push(cityNode);
        totalCities++;
      }

      const countyBbox: [number, number, number, number] = c.bbox || [
        (c.centroidLng || -96.5) - 0.25,
        (c.centroidLat || 38.5) - 0.25,
        (c.centroidLng || -96.5) + 0.25,
        (c.centroidLat || 38.5) + 0.25,
      ];

      const countyNode: CountyBoundaryNode = {
        countyFips: c.countyFips,
        stateFips: c.stateFips || stNode.stateFips,
        countyAnsi: c.countyFips.slice(2),
        countyName: c.countyName,
        rawName: c.rawName,
        stateCode: sc,
        stateName: c.stateName,
        countySeat: c.countySeat,
        centroid: {
          lat: c.centroidLat || 38.5,
          lng: c.centroidLng || -96.5,
        },
        bbox: countyBbox,
        landAreaSqMiles: Number.isFinite(c.landAreaSqMiles) ? c.landAreaSqMiles : 0,
        primaryZipCodes: c.primaryZipCodes || [],
        geometry: null,
        boundarySource: 'U.S. Census Bureau TIGER/Line NAD83 (GEOID ' + c.countyFips + ')',
        citiesByName,
        citiesList,
        countyRecord: c,
      };

      stNode.countiesByFips[c.countyFips] = countyNode;
      stNode.countiesByName[c.countyName.toLowerCase()] = countyNode;
      stNode.countiesByName[c.rawName.toLowerCase()] = countyNode;
      stNode.countiesList.push(countyNode);
      stNode.totalLandAreaSqMiles = +(stNode.totalLandAreaSqMiles + countyNode.landAreaSqMiles).toFixed(1);
      stNode.totalCitiesCount += citiesList.length;

      // Expand state bounding box
      if (countyBbox[0] < stNode.bbox[0]) stNode.bbox[0] = countyBbox[0];
      if (countyBbox[1] < stNode.bbox[1]) stNode.bbox[1] = countyBbox[1];
      if (countyBbox[2] > stNode.bbox[2]) stNode.bbox[2] = countyBbox[2];
      if (countyBbox[3] > stNode.bbox[3]) stNode.bbox[3] = countyBbox[3];

      countiesByFips[c.countyFips] = countyNode;
    }

    const statesList = Object.values(statesByCode).sort((a, b) => a.stateName.localeCompare(b.stateName));

    this.hierarchy = {
      statesByCode,
      statesList,
      countiesByFips,
      totalStates: statesList.length,
      totalCounties: ALL_NATIONWIDE_COUNTIES.length,
      totalCities,
    };

    if (agencies !== undefined) {
      this.mapProvidersToHierarchy(agencies);
    }

    return this.hierarchy;
  }

  /**
   * Map EMS & Fire providers into their corresponding State -> County -> City nodes
   */
  public mapProvidersToHierarchy(agencies: Agency[]): void {
    const h = this.getHierarchy();
    for (const st of h.statesList) {
      for (const co of st.countiesList) {
        for (const ct of co.citiesList) {
          ct.providers = [];
        }
      }
    }

    for (const ag of agencies) {
      if (!hasCompleteVerifiedDirectoryProfile(ag)) continue;
      const stNode = h.statesByCode[ag.stateCode.toUpperCase()];
      if (!stNode) continue;
      const cClean = ag.county.toLowerCase().trim();
      const cRaw = cClean.replace(/ county| parish| borough/gi, '').trim();
      const coNode = stNode.countiesByName[cClean] || stNode.countiesByName[cRaw];
      if (!coNode) continue;
      const cityKey = ag.city.toLowerCase().trim();
      const ctNode = coNode.citiesByName[cityKey];
      if (ctNode) {
        ctNode.providers.push(ag);
      }
    }
  }

  /**
   * Fetch real-world GeoJSON county boundary polygons for a state (or single county)
   * and attach the polygon geometries to the CountyBoundaryNode hierarchy.
   */
  public async fetchStateCountyBoundaries(stateCode: string): Promise<CountyBoundaryNode[]> {
    const sc = stateCode.toUpperCase().trim();
    const h = this.getHierarchy();
    const stNode = h.statesByCode[sc];
    if (!stNode) return [];

    if (this.stateFeaturesCache.has(sc)) {
      return stNode.countiesList;
    }

    if (this.inFlightStateRequests.has(sc)) {
      await this.inFlightStateRequests.get(sc);
      return stNode.countiesList;
    }

    const requestPromise = (async () => {
      try {
        const query = new URLSearchParams({
          where: `STATE='${stNode.stateFips.padStart(2, '0')}'`,
          outFields: 'GEOID,NAME,STATE,COUNTY,AREALAND,AREAWATER,CENTLAT,CENTLON,INTPTLAT,INTPTLON',
          returnGeometry: 'true',
          outSR: '4326',
          f: 'geojson',
        });
        const response = await fetch(
          `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/55/query?${query.toString()}`,
          { headers: { Accept: 'application/geo+json, application/json' } },
        );
        if (!response.ok) throw new Error(`Census TIGERweb returned HTTP ${response.status}`);
        const collection = await response.json() as {
          type?: string;
          features?: Array<{
            type?: string;
            id?: string | number;
            properties?: Record<string, unknown>;
            geometry?: GeoJsonGeometry | null;
          }>;
          error?: { message?: string };
        };
        if (collection.error) throw new Error(collection.error.message || 'Census TIGERweb query failed');
        if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
          throw new Error('Census TIGERweb returned an invalid boundary collection');
        }

        const stateFeatures = collection.features.map((feature) => {
          const props = feature.properties || {};
          const geoid = String(props.GEOID || feature.id || '').padStart(5, '0');
          const countyName = String(props.NAME || '').trim();
          const bbox = this.getGeometryBounds(feature.geometry || null);
          const landAreaSqMiles = Number(props.AREALAND) / 2_589_988.110336;
          const centroidLat = Number(props.CENTLAT ?? props.INTPTLAT);
          const centroidLng = Number(props.CENTLON ?? props.INTPTLON);
          if (!/^\d{5}$/.test(geoid) || !countyName || !feature.geometry || !bbox) {
            throw new Error('Census TIGERweb returned a county without required boundary fields');
          }

          return {
            type: 'Feature' as const,
            id: geoid,
            properties: {
              GEOID: geoid,
              STATE: String(props.STATE || stNode.stateFips),
              STATE_CODE: sc,
              COUNTY: String(props.COUNTY || geoid.slice(2)),
              NAME: countyName,
              COUNTY_NAME: countyName,
              COUNTY_SEAT: '',
              LSAD: 'County equivalent',
              CENSUSAREA: Number.isFinite(landAreaSqMiles) ? +landAreaSqMiles.toFixed(1) : 0,
              CENTLAT: Number.isFinite(centroidLat) ? centroidLat : (bbox[1] + bbox[3]) / 2,
              CENTLON: Number.isFinite(centroidLng) ? centroidLng : (bbox[0] + bbox[2]) / 2,
              BBOX: bbox,
              CITIES_COUNT: 0,
            },
            geometry: feature.geometry,
          };
        });

        const expectedFips = new Set(stNode.countiesList.map((county) => county.countyFips));
        const returnedFips = new Set(stateFeatures.map((feature) => feature.properties.GEOID));
        const missingFips = [...expectedFips].filter((fips) => !returnedFips.has(fips));
        const unexpectedFips = [...returnedFips].filter((fips) => !expectedFips.has(fips));
        if (missingFips.length || unexpectedFips.length) {
          throw new Error(
            `Census boundary coverage mismatch for ${sc}: missing ${missingFips.length}, unexpected ${unexpectedFips.length}`,
          );
        }

        this.attachFeaturesToStateNode(stNode, stateFeatures);
        stNode.boundarySourceInfo = {
          source: 'U.S. Census TIGERweb',
          vintage: '2020 Census geography',
          retrievedAt: new Date().toISOString(),
          isFallback: false,
        };
        this.stateFeaturesCache.set(sc, stateFeatures);
        return stateFeatures;
      } catch (err) {
        console.warn('Live Census boundary query failed; trying the bundled boundary fallback.', err);
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}data/us-counties-boundaries.json.gz.txt`);
          if (!response.ok) throw new Error('Bundled boundary asset unavailable');
          const encoded = (await response.text()).trim();
          const binary = Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0));
          const collection = JSON.parse(strFromU8(gunzipSync(binary)));
          const allFeatures: CountyBoundaryGeoJsonFeature[] = Array.isArray(collection.features)
            ? collection.features : [];
          const stateFeatures = allFeatures.filter(f => f.properties?.STATE_CODE === sc);
          const normalizedNames = new Set(stateFeatures.map((feature) =>
            this.normalizeCountyName(feature.properties?.COUNTY_NAME || feature.properties?.NAME || ''),
          ));
          const missingNames = stNode.countiesList.filter((county) =>
            !normalizedNames.has(this.normalizeCountyName(county.countyName)),
          );
          if (!stateFeatures.length || missingNames.length) {
            throw new Error(`Bundled boundary coverage is incomplete for ${sc}`);
          }

          this.attachFeaturesToStateNode(stNode, stateFeatures);
          stNode.boundarySourceInfo = {
            source: 'Bundled boundary fallback',
            vintage: 'Source vintage not recorded',
            retrievedAt: new Date().toISOString(),
            isFallback: true,
          };
          this.stateFeaturesCache.set(sc, stateFeatures);
          return stateFeatures;
        } catch (fallbackErr) {
          console.error('Neither live nor bundled Census boundaries could be loaded.', fallbackErr);
          throw new Error(`County boundaries could not be loaded for ${sc}`);
        }
      }
    })();

    this.inFlightStateRequests.set(sc, requestPromise);
    try {
      await requestPromise;
    } finally {
      this.inFlightStateRequests.delete(sc);
    }

    return stNode.countiesList;
  }

  private normalizeCountyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/\b(city and borough|census area|municipality|county|parish|borough|city)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private getGeometryBounds(geometry: GeoJsonGeometry | null): [number, number, number, number] | null {
    if (!geometry) return null;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    const visit = (value: unknown) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
        minLng = Math.min(minLng, value[0]);
        minLat = Math.min(minLat, value[1]);
        maxLng = Math.max(maxLng, value[0]);
        maxLat = Math.max(maxLat, value[1]);
        return;
      }
      for (const child of value) visit(child);
    };
    visit(geometry.coordinates);
    return Number.isFinite(minLng) && Number.isFinite(minLat) && Number.isFinite(maxLng) && Number.isFinite(maxLat)
      ? [minLng, minLat, maxLng, maxLat]
      : null;
  }

  private attachFeaturesToStateNode(stNode: StateHierarchyNode, features: CountyBoundaryGeoJsonFeature[]): void {
    for (const f of features) {
      const fips = String(f.id || f.properties?.GEOID || '').padStart(5, '0');
      const featureName = f.properties?.COUNTY_NAME || f.properties?.NAME || '';
      const byFips = stNode.countiesByFips[fips];
      const normalizedFeatureName = this.normalizeCountyName(featureName);
      const byName = stNode.countiesList.find((county) =>
        this.normalizeCountyName(county.countyName) === normalizedFeatureName ||
        this.normalizeCountyName(county.rawName) === normalizedFeatureName,
      );
      const fipsNameMatches = byFips && (
        !normalizedFeatureName ||
        this.normalizeCountyName(byFips.countyName) === normalizedFeatureName ||
        this.normalizeCountyName(byFips.rawName) === normalizedFeatureName
      );
      const coNode = fipsNameMatches ? byFips : byName || byFips;

      if (coNode && f.geometry) {
        coNode.geometry = f.geometry;
        if (Number.isFinite(f.properties?.CENSUSAREA) && f.properties.CENSUSAREA > 0) {
          coNode.landAreaSqMiles = +Number(f.properties.CENSUSAREA).toFixed(1);
        }
        if (f.properties?.BBOX && Array.isArray(f.properties.BBOX) && f.properties.BBOX.length === 4) {
          coNode.bbox = f.properties.BBOX;
        }
        if (f.properties?.CENTLAT && f.properties?.CENTLON) {
          coNode.centroid = {
            lat: Number(f.properties.CENTLAT),
            lng: Number(f.properties.CENTLON),
          };
        }
      }
    }
    stNode.totalLandAreaSqMiles = +stNode.countiesList
      .reduce((sum, county) => sum + (county.landAreaSqMiles || 0), 0)
      .toFixed(1);
  }

  /**
   * Project all county boundary polygons in a State into SVG path strings
   * for interactive choropleth & boundary rendering.
   */
  public projectStateCountiesToSvg(
    stateCode: string,
    width: number = 760,
    height: number = 420,
    padding: number = 24
  ): {
    projectedCounties: SvgProjectedCounty[];
    bbox: [number, number, number, number];
  } {
    const sc = stateCode.toUpperCase().trim();
    const h = this.getHierarchy();
    const stNode = h.statesByCode[sc];
    if (!stNode) return { projectedCounties: [], bbox: [-98, 38, -97, 39] };

    const countiesWithGeom = stNode.countiesList.filter((c) => c.geometry !== null);
    if (countiesWithGeom.length === 0) {
      return { projectedCounties: [], bbox: stNode.bbox };
    }

    // Compute exact bounding box across all county geometries in the state
    // For Alaska ('AK'), clamp positive antimeridian longitudes so mainland + panhandle fill the viewport cleanly
    let minLng = 180,
      minLat = 90,
      maxLng = -180,
      maxLat = -90;

    const normalizeLng = (lng: number) => (sc === 'AK' && lng > 0 ? lng - 360 : lng);

    for (const co of countiesWithGeom) {
      const b = co.bbox;
      const bMinLng = normalizeLng(b[0]);
      const bMaxLng = normalizeLng(b[2]);
      if (bMinLng < minLng) minLng = bMinLng;
      if (bMaxLng > maxLng) maxLng = bMaxLng;
      if (b[1] < minLat) minLat = b[1];
      if (b[3] > maxLat) maxLat = b[3];
    }

    const lngSpan = Math.max(0.05, maxLng - minLng);
    const latSpan = Math.max(0.05, maxLat - minLat);
    const cosLat = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const adjustedLngSpan = lngSpan * cosLat;

    const availW = width - padding * 2;
    const availH = height - padding * 2;
    const scale = Math.min(availW / adjustedLngSpan, availH / latSpan);

    const drawnW = adjustedLngSpan * scale;
    const drawnH = latSpan * scale;
    const offsetX = padding + (availW - drawnW) / 2;
    const offsetY = padding + (availH - drawnH) / 2;

    const projectPoint = (lng: number, lat: number): [number, number] => {
      const nLng = normalizeLng(lng);
      const x = offsetX + (nLng - minLng) * cosLat * scale;
      const y = offsetY + (maxLat - lat) * scale;
      return [+x.toFixed(1), +y.toFixed(1)];
    };

    const projectedCounties: SvgProjectedCounty[] = [];

    for (const co of countiesWithGeom) {
      const svgPath = this.geometryToSvgPath(co.geometry!, projectPoint);
      if (!svgPath) continue;
      const [labelX, labelY] = projectPoint(co.centroid.lng, co.centroid.lat);

      projectedCounties.push({
        countyFips: co.countyFips,
        countyName: co.countyName,
        countySeat: co.countySeat,
        stateCode: sc,
        landAreaSqMiles: co.landAreaSqMiles,
        citiesCount: co.citiesList.length,
        svgPath,
        labelX,
        labelY,
        node: co,
      });
    }

    return {
      projectedCounties,
      bbox: [minLng, minLat, maxLng, maxLat],
    };
  }

  /**
   * Project a single County's real-world boundary polygon AND its mapped real-world Cities
   * into a high-detail SVG viewport.
   */
  public projectSingleCountyBoundaryToSvg(
    countyNode: CountyBoundaryNode,
    agencies: Agency[] = [],
    width: number = 520,
    height: number = 340,
    padding: number = 32
  ): {
    svgPath: string;
    cityPins: SvgProjectedCityPin[];
    centroidSvg: [number, number];
  } {
    const sc = countyNode.stateCode;
    const normalizeLng = (lng: number) => (sc === 'AK' && lng > 0 ? lng - 360 : lng);

    let minLng = normalizeLng(countyNode.bbox[0]);
    let minLat = countyNode.bbox[1];
    let maxLng = normalizeLng(countyNode.bbox[2]);
    let maxLat = countyNode.bbox[3];

    const lngSpan = Math.max(0.04, maxLng - minLng);
    const latSpan = Math.max(0.04, maxLat - minLat);
    const cosLat = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const adjustedLngSpan = lngSpan * cosLat;

    const availW = width - padding * 2;
    const availH = height - padding * 2;
    const scale = Math.min(availW / adjustedLngSpan, availH / latSpan);

    const drawnW = adjustedLngSpan * scale;
    const drawnH = latSpan * scale;
    const offsetX = padding + (availW - drawnW) / 2;
    const offsetY = padding + (availH - drawnH) / 2;

    const projectPoint = (lng: number, lat: number): [number, number] => {
      const nLng = normalizeLng(lng);
      const x = Math.max(padding * 0.6, Math.min(width - padding * 0.6, offsetX + (nLng - minLng) * cosLat * scale));
      const y = Math.max(padding * 0.6, Math.min(height - padding * 0.6, offsetY + (maxLat - lat) * scale));
      return [+x.toFixed(1), +y.toFixed(1)];
    };

    const svgPath = countyNode.geometry ? this.geometryToSvgPath(countyNode.geometry, projectPoint) : '';
    const centroidSvg = projectPoint(countyNode.centroid.lng, countyNode.centroid.lat);

    // The bundled city/ZIP coordinates have no field-level source evidence.
    // Keep names available for navigation, but do not plot them as verified locations.
    const cityPins: SvgProjectedCityPin[] = [];

    return {
      svgPath,
      cityPins,
      centroidSvg,
    };
  }

  private geometryToSvgPath(
    geometry: GeoJsonGeometry,
    projectPoint: (lng: number, lat: number) => [number, number]
  ): string {
    const parts: string[] = [];

    const ringToPath = (ring: number[][]) => {
      if (!ring || ring.length === 0) return;
      for (let i = 0; i < ring.length; i++) {
        const pt = ring[i];
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const [x, y] = projectPoint(pt[0], pt[1]);
        parts.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
      }
      parts.push('Z');
    };

    if (geometry.type === 'Polygon') {
      const rings = geometry.coordinates as number[][][];
      for (const ring of rings) {
        ringToPath(ring);
      }
    } else if (geometry.type === 'MultiPolygon') {
      const polys = geometry.coordinates as number[][][][];
      for (const poly of polys) {
        for (const ring of poly) {
          ringToPath(ring);
        }
      }
    }

    return parts.join(' ');
  }
}

export const countyBoundaryHierarchy = new CountyBoundaryHierarchyService();
