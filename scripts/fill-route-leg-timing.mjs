#!/usr/bin/env node
/**
 * fill-route-leg-timing.mjs
 * --------------------------------------------------------------------------
 * Fills the NULL algorithmic timing/distance on the DERIVED route-leg-index
 * (generated/itinerary-intelligence/route-leg-index.json) using:
 *   - OSRM (free-flow)        -> distance_km_mapbox + duration_minutes_mapbox
 *   - Google Routes (traffic) -> duration_minutes_busy_routes   [optional, NEW field]
 *
 * It READS the repo's real legs; it does NOT invent leg pairs.
 * It is NON-DESTRUCTIVE: output goes to route-leg-index.filled.json for review.
 * The `*_operator` fields are left untouched (that is the ops/manual layer; join
 * those from 04-route-leg-index.json separately).
 *
 * PLACEMENT: drop this + route-node-coordinates.json in scripts/ (or repo root).
 *
 * PREREQS:
 *   1) OSRM running (see runbook). Default OSRM_URL=http://localhost:5000
 *   2) route-node-coordinates.json next to this file.
 *   3) (optional) export GOOGLE_MAPS_API_KEY=...   for traffic-aware busy timing.
 *      The key is read from env only; it is never written to any output file.
 *
 * RUN:
 *   node scripts/fill-route-leg-timing.mjs
 *   OSRM_URL=http://localhost:5000 GOOGLE_MAPS_API_KEY=$KEY node scripts/fill-route-leg-timing.mjs
 * --------------------------------------------------------------------------
 */
import { readFile, writeFile } from 'node:fs/promises';

const GEN = 'generated/itinerary-intelligence';
const OSRM_URL = process.env.OSRM_URL ?? 'http://localhost:5000';
const GKEY = process.env.GOOGLE_MAPS_API_KEY ?? null;

const coordsDoc = JSON.parse(
  await readFile(new URL('./route-node-coordinates.json', import.meta.url), 'utf8')
);
const coordMap = Object.fromEntries(coordsDoc.nodes.map((n) => [n.node_id, n]));

const legs = JSON.parse(await readFile(`${GEN}/route-leg-index.json`, 'utf8'));
if (!Array.isArray(legs)) {
  console.error('route-leg-index.json is not an array; aborting.');
  process.exit(1);
}

const coordFor = (id) => {
  const c = coordMap[id];
  return c && c.lat != null && c.lng != null ? c : null;
};

async function osrmLeg(a, b) {
  const url = `${OSRM_URL}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`OSRM HTTP ${r.status}`);
  const j = await r.json();
  if (j.code !== 'Ok' || !j.routes?.length) return null;
  const rt = j.routes[0];
  return {
    duration_min: Math.round(rt.duration / 60),
    distance_km: +(rt.distance / 1000).toFixed(1),
  };
}

function nextPeakISO() {
  // Representative peak: tomorrow 08:00 WIB (= 01:00 UTC). Google requires a FUTURE departureTime.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(1, 0, 0, 0);
  return d.toISOString();
}

async function googleLeg(a, b) {
  if (!GKEY) return null;
  const body = {
    origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
    destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
    departureTime: nextPeakISO(),
  };
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GKEY,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Google HTTP ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const rt = j.routes?.[0];
  if (!rt) return null;
  const durSec = parseInt(String(rt.duration).replace('s', ''), 10);
  return { duration_busy_min: Math.round(durSec / 60) };
}

let filled = 0;
const skipped = [];
for (const leg of legs) {
  const a = coordFor(leg.from_node);
  const b = coordFor(leg.to_node);
  if (!a || !b) {
    skipped.push({
      leg: leg.route_leg_id ?? leg.id,
      reason: `missing coord for ${!a ? leg.from_node : ''}${!a && !b ? ' + ' : ''}${!b ? leg.to_node : ''}`,
    });
    continue;
  }
  try {
    const o = await osrmLeg(a, b);
    if (o) {
      leg.distance_km_mapbox = o.distance_km;
      leg.duration_minutes_mapbox = o.duration_min;
      leg.missing_fields = (leg.missing_fields ?? []).filter(
        (f) => !['distance_km_mapbox', 'duration_minutes_mapbox'].includes(f)
      );
      leg._timing_source = {
        mapbox_fields_filled_by: 'OSRM free-flow (no traffic)',
        osrm_url: OSRM_URL,
        generated_at: new Date().toISOString(),
      };
      filled++;
    }
    const g = await googleLeg(a, b);
    if (g) {
      leg.duration_minutes_busy_routes = g.duration_busy_min; // NEW extension field (traffic-aware)
      leg._timing_source = {
        ...(leg._timing_source ?? {}),
        busy_field_filled_by: 'Google Routes TRAFFIC_AWARE_OPTIMAL @ next 08:00 WIB',
        cache_policy: 'refresh <= 30 days per Google Maps Platform ToS',
      };
    }
  } catch (e) {
    skipped.push({ leg: leg.route_leg_id ?? leg.id, reason: String(e.message ?? e) });
  }
}

const out = `${GEN}/route-leg-index.filled.json`;
await writeFile(out, JSON.stringify(legs, null, 2) + '\n');
console.log(
  JSON.stringify(
    { total_legs: legs.length, filled, skipped_count: skipped.length, skipped, google_used: !!GKEY, out },
    null,
    2
  )
);
