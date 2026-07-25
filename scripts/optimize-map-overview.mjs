import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overviewPath = path.join(root, 'assets', 'maps', 'world_1634_overview.js');
const worldPath = path.join(root, 'assets', 'maps', 'world_1634.js');
const variablePrefix = 'var WORLD_1634_OVERVIEW=';
const minimumPolygonArea = 0.001;
const supplementalRegionNames = new Set([
  '印度教与伊斯兰诸邦',
  '比达尔苏丹国',
  '比贾布尔苏丹国',
  '艾哈迈德讷格尔苏丹国',
  '戈尔康达苏丹国',
  '维查耶那伽罗残余',
]);

function ringArea(ring) {
  let twiceArea = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    twiceArea += ring[previous][0] * ring[index][1] - ring[index][0] * ring[previous][1];
  }
  return Math.abs(twiceArea / 2);
}

function cleanPolygon(polygon, counters) {
  counters.interiorRingsRemoved += Math.max(0, polygon.length - 1);
  return [polygon[0]];
}

function cleanGeometry(geometry, counters) {
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: cleanPolygon(geometry.coordinates, counters) };
  }
  if (geometry.type !== 'MultiPolygon') return geometry;

  const cleaned = geometry.coordinates.map(polygon => cleanPolygon(polygon, counters));
  const retained = cleaned.filter(polygon => ringArea(polygon[0]) >= minimumPolygonArea);
  counters.microPolygonsRemoved += cleaned.length - retained.length;

  // Never erase an entire named region if its source only contains tiny islands.
  if (!retained.length && cleaned.length) {
    retained.push(
      cleaned.reduce((largest, polygon) => (ringArea(polygon[0]) > ringArea(largest[0]) ? polygon : largest)),
    );
    counters.microPolygonsRemoved -= 1;
  }
  return { ...geometry, coordinates: retained };
}

function parseWrappedMap(source, prefix, sourcePath) {
  if (!source.startsWith(prefix)) throw new Error(`Unexpected map wrapper in ${sourcePath}`);
  return JSON.parse(source.slice(prefix.length).trim().replace(/;$/, ''));
}

const source = await readFile(overviewPath, 'utf8');
const worldSource = await readFile(worldPath, 'utf8');
const map = parseWrappedMap(source, variablePrefix, overviewPath);
const world = vm.runInNewContext(`${worldSource}\nWORLD_1634`, Object.create(null));
const supplementalFeatures = world.features
  .filter(feature => supplementalRegionNames.has(feature.properties?.name))
  .map(feature => ({
    type: 'Feature',
    properties: {
      name: feature.properties.name,
      detail_count: 1,
      overview_source: 'world_1634',
    },
    geometry: feature.geometry,
  }));
if (supplementalFeatures.length !== supplementalRegionNames.size) {
  const found = new Set(supplementalFeatures.map(feature => feature.properties.name));
  const missing = [...supplementalRegionNames].filter(name => !found.has(name));
  throw new Error(`Missing supplemental overview regions in ${worldPath}: ${missing.join(', ')}`);
}

map.features = map.features.filter(feature => !supplementalRegionNames.has(feature.properties?.name));
map.features.push(...supplementalFeatures);
const counters = { interiorRingsRemoved: 0, microPolygonsRemoved: 0 };
map.features = map.features.map(feature => ({
  ...feature,
  geometry: cleanGeometry(feature.geometry, counters),
}));
map.metadata = {
  ...(map.metadata || {}),
  overview_cleanup: {
    purpose: 'Remove dissolve artifacts while preserving coastlines and meaningful islands',
    minimum_polygon_area_degrees2: minimumPolygonArea,
    interior_rings_removed:
      counters.interiorRingsRemoved || map.metadata?.overview_cleanup?.interior_rings_removed || 0,
    micro_polygons_removed:
      counters.microPolygonsRemoved || map.metadata?.overview_cleanup?.micro_polygons_removed || 0,
  },
  supplemental_overview_regions: [...supplementalRegionNames],
};

await writeFile(overviewPath, `${variablePrefix}${JSON.stringify(map)};\n`, 'utf8');
console.info(
  `Optimized ${path.relative(root, overviewPath)}: added ${supplementalFeatures.length} supplemental region(s), removed ${counters.interiorRingsRemoved} interior rings and ${counters.microPolygonsRemoved} micro-polygons.`,
);
