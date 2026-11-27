type Ring = [number, number][];
type Boundary = { id: string; properties: { STATE_CODE: string; BBOX: number[] }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Ring[] | Ring[][] } };
function insideRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i];
    const [c, d] = ring[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
  }
  return inside;
}
export function createSourceCoverageGeography(features: Boundary[], counties: ReadonlyMap<string, string>, states: Iterable<string>) {
  const supported = new Set(states);
  const shapes = features.filter(feature => supported.has(feature.properties.STATE_CODE) && counties.has(feature.id));
  const byState = new Map([...supported].map(state => [state, shapes.filter(feature => feature.properties.STATE_CODE === state)]));
  const prefixes = new Map(shapes.map(shape => [shape.id.slice(0, 2), shape.properties.STATE_CODE]));
  function countyAtPoint([y, x]: [number, number], state?: string) {
    const matches = (state ? byState.get(state) ?? [] : shapes).filter(feature => {
      const [west, south, east, north] = feature.properties.BBOX;
      if (x < west || x > east || y < south || y > north) return false;
      const { type, coordinates } = feature.geometry;
      const polygons = type === 'Polygon' ? [coordinates as Ring[]] : coordinates as Ring[][];
      return polygons.some(([outer, ...holes]) => insideRing(x, y, outer) && !holes.some(ring => insideRing(x, y, ring)));
    });
    return matches.length === 1 ? matches[0].id : '';
  }
  return { countyAtPoint, prefixes };
}
