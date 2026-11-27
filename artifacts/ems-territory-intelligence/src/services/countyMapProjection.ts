import type { CountyBoundaryNode } from './countyBoundaryHierarchyService';

export const mapWidth = 640,
  mapHeight = 360;
export type XY = [number, number];
export function worldPoint(latitude: number, longitude: number, anchor: number): XY {
  const delta = ((longitude - anchor + 540) % 360) - 180;
  const sin = Math.sin((Math.max(-85.051129, Math.min(85.051129, latitude)) * Math.PI) / 180);
  return [(anchor + delta + 180) / 360, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)];
}

export function countyViewport(
  county: Pick<CountyBoundaryNode, 'geometry' | 'centroid' | 'bbox'>,
  magnify: number,
  focus?: XY,
) {
  const { geometry, centroid, bbox } = county;
  const polygons =
    geometry?.type === 'Polygon'
      ? [geometry.coordinates as number[][][]]
      : ((geometry?.coordinates as number[][][][]) ?? []);
  const rings = polygons.flat().map((ring) => ring.map(([lng, lat]) => worldPoint(lat, lng, centroid.lng)));
  const extent = rings.flat();
  if (!extent.length)
    extent.push(worldPoint(bbox[1], bbox[0], centroid.lng), worldPoint(bbox[3], bbox[2], centroid.lng));
  let west = Infinity,
    east = -Infinity,
    north = Infinity,
    south = -Infinity;
  for (const [x, y] of extent) {
    west = Math.min(west, x);
    east = Math.max(east, x);
    north = Math.min(north, y);
    south = Math.max(south, y);
  }
  const scale =
    Math.min(
      (mapWidth - 58) / Math.max(0.00001, east - west),
      (mapHeight - 54) / Math.max(0.00001, south - north),
    ) * magnify;
  const [cx, cy] = focus ?? [(west + east) / 2, (north + south) / 2];
  const left = cx - mapWidth / (2 * scale),
    top = cy - mapHeight / (2 * scale);
  const project = ([x, y]: XY): XY => [(x - left) * scale, (y - top) * scale];
  const path = rings
    .map(
      (ring) =>
        ring
          .map((v, i) => {
            const [x, y] = project(v);
            return (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
          })
          .join('') + 'Z',
    )
    .join('');
  const zoom = Math.max(0, Math.min(16, Math.ceil(Math.log2(scale / 256))));
  const across = 2 ** zoom,
    size = scale / across;
  const tiles: { id: string; url: string; x: number; y: number; size: number }[] = [];
  for (
    let y = Math.max(0, Math.floor(top * across));
    y <= Math.min(across - 1, Math.floor((top + mapHeight / scale) * across));
    y++
  ) {
    for (let x = Math.floor(left * across); x <= Math.floor((left + mapWidth / scale) * across); x++) {
      const [px, py] = project([x / across, y / across]);
      const id = zoom + '/' + y + '/' + (((x % across) + across) % across);
      tiles.push({
        id,
        url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/' + id,
        x: px,
        y: py,
        size,
      });
    }
  }
  return { path, tiles, project, center: [cx, cy] as XY, scale };
}
