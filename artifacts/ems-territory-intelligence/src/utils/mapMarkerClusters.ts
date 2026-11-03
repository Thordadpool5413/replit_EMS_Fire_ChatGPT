export interface MapMarkerLocation {
  id: string;
  latitude: number;
  longitude: number;
}

const MARKER_COLLISION_WIDTH_PX = 90;
const MARKER_COLLISION_HEIGHT_PX = 64;
const MAX_MERCATOR_LATITUDE = 85.05112878;

function toWorldPixels(
  latitude: number,
  longitude: number,
  zoom: number,
): { x: number; y: number; worldSize: number } {
  const worldSize = 256 * 2 ** Math.max(0, Math.min(22, zoom));
  const clampedLatitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude),
  );
  const sinLatitude = Math.sin((clampedLatitude * Math.PI) / 180);

  return {
    x: ((longitude + 180) / 360) * worldSize,
    y:
      (0.5 -
        Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) *
      worldSize,
    worldSize,
  };
}

/**
 * Groups markers whose estimate badges would overlap at the current map zoom.
 * Groups are transitive so every overlapping marker remains inspectable together.
 */
export function groupOverlappingMapMarkers<T extends MapMarkerLocation>(
  markers: readonly T[],
  zoom: number,
): T[][] {
  if (markers.length < 2) return markers.map((marker) => [marker]);

  const projected = markers.map((marker) =>
    toWorldPixels(marker.latitude, marker.longitude, zoom),
  );
  const parents = markers.map((_, index) => index);

  const findRoot = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const parent = parents[index];
      parents[index] = root;
      index = parent;
    }
    return root;
  };

  for (let left = 0; left < markers.length; left += 1) {
    for (let right = left + 1; right < markers.length; right += 1) {
      const leftPoint = projected[left];
      const rightPoint = projected[right];
      const rawXDistance = Math.abs(leftPoint.x - rightPoint.x);
      const xDistance = Math.min(
        rawXDistance,
        leftPoint.worldSize - rawXDistance,
      );
      const yDistance = Math.abs(leftPoint.y - rightPoint.y);

      if (
        xDistance < MARKER_COLLISION_WIDTH_PX &&
        yDistance < MARKER_COLLISION_HEIGHT_PX
      ) {
        const leftRoot = findRoot(left);
        const rightRoot = findRoot(right);
        if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
      }
    }
  }

  const groups = new Map<number, T[]>();
  markers.forEach((marker, index) => {
    const root = findRoot(index);
    const group = groups.get(root) ?? [];
    group.push(marker);
    groups.set(root, group);
  });

  return [...groups.values()];
}
