#!/usr/bin/env node
/**
 * fill-tomtom-routing.mjs
 * -----------------------------------------------------------------------
 * Calls the TomTom Routing API for each corridor leg and writes
 * non-destructive review files. Run once, review outputs, then commit.
 *
 * PREREQS:
 *   export TOMTOM_API_KEY=<your_key>
 *
 * RUN:
 *   TOMTOM_API_KEY=$KEY node scripts/fill-tomtom-routing.mjs
 *
 * OUTPUTS (review files — never overwrites canonical outputs):
 *   generated/itinerary-intelligence/28-tomtom-geotag-index.filled.json
 *
 * After review, promote by copying over 28-tomtom-geotag-index.json and
 * re-running: npm run compile  (the compile pipeline reads routed_legs
 * from buildTomTomGeotagIndex if you wire them in; the script output is
 * currently a standalone enriched index for review).
 * -----------------------------------------------------------------------
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GENERATED_DIR = process.env.GENERATED_DIR ?? join(ROOT, 'generated/itinerary-intelligence');
const SEED_PATH = join(__dirname, 'tomtom-verified-nodes.json');

// Corridor legs to route (excludes ferry leg — water crossing, not road)
const CORRIDOR_LEGS = [
  { leg_id: 'surabaya_airport_to_bromo_area', from_node: 'surabaya_airport', to_node: 'bromo' },
  { leg_id: 'bromo_area_to_madakaripura', from_node: 'bromo', to_node: 'madakaripura' },
  { leg_id: 'bromo_area_to_bondowoso_ijen_area', from_node: 'bromo', to_node: 'bondowoso' },
  { leg_id: 'bondowoso_ijen_area_to_ijen_crater', from_node: 'bondowoso', to_node: 'ijen' },
  { leg_id: 'ijen_area_to_ketapang_harbor', from_node: 'ijen', to_node: 'ketapang_harbor' }
];

const TOMTOM_BASE = 'https://api.tomtom.com/routing/1/calculateRoute';

/** Decode a TomTom encoded polyline (precision 5 or 7) to [lat, lng][] pairs. */
function decodePolyline(encoded, precision = 5) {
  const factor = 10 ** precision;
  const result = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result_bits = 0;
    let b;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result_bits |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result_bits & 1) ? ~(result_bits >> 1) : (result_bits >> 1);
    lat += dlat;
    shift = 0;
    result_bits = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result_bits |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result_bits & 1) ? ~(result_bits >> 1) : (result_bits >> 1);
    lng += dlng;
    result.push([lat / factor, lng / factor]);
  }
  return result;
}

async function routeLeg(apiKey, fromNode, toNode, legId) {
  // Use entry_point for airports and harbors (better routing accuracy)
  const fromCoord = fromNode.entry_point ?? { lat: fromNode.lat, lng: fromNode.lng };
  const toCoord = toNode.entry_point ?? { lat: toNode.lat, lng: toNode.lng };

  const url =
    `${TOMTOM_BASE}/${fromCoord.lat},${fromCoord.lng}:${toCoord.lat},${toCoord.lng}/json` +
    `?key=${apiKey}` +
    `&travelMode=car` +
    `&traffic=true` +
    `&computeTravelTimeFor=all` +
    `&routeRepresentation=encodedPolyline`;

  console.error(`  → routing ${legId}: ${fromCoord.lat},${fromCoord.lng} → ${toCoord.lat},${toCoord.lng}`);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`TomTom routing failed for ${legId}: HTTP ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json();
  const route = data.routes?.[0];
  if (!route) throw new Error(`No route returned for ${legId}`);

  const summary = route.summary;
  const lengthInMeters = summary.lengthInMeters;
  const travelTimeInSeconds = summary.travelTimeInSeconds;
  const trafficDelayInSeconds = summary.trafficDelayInSeconds ?? 0;

  // With routeRepresentation=encodedPolyline, TomTom returns the geometry in
  // legs[].encodedPolyline (a string), not legs[].points (which only holds
  // point objects for the default, non-encoded representation).
  const encodedPolyline = route.legs?.[0]?.encodedPolyline ?? '';
  const precision = route.legs?.[0]?.encodedPolylinePrecision ?? 5;
  const coordinates = encodedPolyline.length > 0 ? decodePolyline(encodedPolyline, precision) : null;

  // Detect toll/motorway from sections
  const sections = route.sections ?? [];
  const has_toll = sections.some((s) => s.sectionType === 'TOLL_ROAD');
  const has_motorway = sections.some((s) => s.sectionType === 'MOTORWAY');

  return {
    leg_id: legId,
    from_node_id: fromNode.node_id,
    to_node_id: toNode.node_id,
    distance_km_tomtom: Math.round(lengthInMeters / 100) / 10,
    duration_normal_minutes_tomtom: Math.round(travelTimeInSeconds / 60),
    duration_busy_minutes_tomtom: trafficDelayInSeconds > 0
      ? Math.round((travelTimeInSeconds + trafficDelayInSeconds) / 60)
      : null,
    has_toll,
    has_motorway,
    geometry_type: 'tomtom_routed_polyline',
    coordinates,
    routing_source: 'tomtom_routing_api_v1',
    traffic_model: 'live',
    routed_at: new Date().toISOString()
  };
}

async function main() {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    console.error('ERROR: TOMTOM_API_KEY env var is required.');
    console.error('  export TOMTOM_API_KEY=<your_key>');
    console.error('  node scripts/fill-tomtom-routing.mjs');
    process.exit(1);
  }

  console.error('Loading TomTom verified nodes seed...');
  const seedRaw = await readFile(SEED_PATH, 'utf8');
  const seed = JSON.parse(seedRaw);
  const nodeMap = new Map(seed.nodes.map((n) => [n.node_id, n]));

  // Also register aliases
  for (const node of seed.nodes) {
    if (node.node_id_aliases) {
      for (const alias of node.node_id_aliases) nodeMap.set(alias, node);
    }
  }

  console.error(`Routing ${CORRIDOR_LEGS.length} corridor legs (250ms delay between calls)...`);
  const routed_legs = [];
  for (const leg of CORRIDOR_LEGS) {
    const fromNode = nodeMap.get(leg.from_node);
    const toNode = nodeMap.get(leg.to_node);
    if (!fromNode) { console.error(`  SKIP ${leg.leg_id}: from_node '${leg.from_node}' not in seed`); continue; }
    if (!toNode) { console.error(`  SKIP ${leg.leg_id}: to_node '${leg.to_node}' not in seed`); continue; }
    try {
      const result = await routeLeg(apiKey, fromNode, toNode, leg.leg_id);
      routed_legs.push(result);
      console.error(`  ✓ ${leg.leg_id}: ${result.distance_km_tomtom}km, ${result.duration_normal_minutes_tomtom}min`);
    } catch (err) {
      console.error(`  ✗ ${leg.leg_id}: ${err.message}`);
    }
    // Rate limit: TomTom free tier allows ~5 req/sec; 250ms gap is safe
    await new Promise((r) => setTimeout(r, 250));
  }

  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    geo_source: 'tomtom_maps_api',
    fill_status: routed_legs.length > 0 ? 'routing_filled' : 'seed_only',
    nodes: seed.nodes.map(({ node_id, label, lat, lng, tomtom_place_id, tomtom_category, confidence, geo_source, verified_at }) => ({
      node_id, label, lat, lng, geo_status: confidence === 'verified_tomtom_api' ? 'verified_tomtom' : 'seed_approximation',
      tomtom_place_id: tomtom_place_id ?? null,
      tomtom_category: tomtom_category ?? null,
      geo_source,
      verified_at
    })),
    routed_legs: routed_legs,
    dynamic_render_config: {
      sdk: 'tomtom-web-sdk-v6',
      api_key_env: 'TOMTOM_API_KEY',
      map_style: 'tomtom://vector/1/basic-main',
      center: [113.5, -7.9],
      zoom: 8,
      traffic_flow: true,
      traffic_incidents: true,
      marker_layer_ids: ['surabaya_airport', 'bromo', 'madakaripura', 'bondowoso_ijen_area', 'ijen', 'ketapang_harbor'],
      route_layer_ids: CORRIDOR_LEGS.map((l) => l.leg_id)
    }
  };

  await mkdir(GENERATED_DIR, { recursive: true });
  const outPath = join(GENERATED_DIR, '28-tomtom-geotag-index.filled.json');
  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');

  const summary = {
    nodes_total: output.nodes.length,
    nodes_tomtom_verified: output.nodes.filter((n) => n.geo_status === 'verified_tomtom').length,
    legs_routed: routed_legs.length,
    legs_attempted: CORRIDOR_LEGS.length,
    output: outPath
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
