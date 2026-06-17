import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJvtoWeb } from '../extract/extract-jvto-web.js';
import { buildLocationCoordinateIndex } from './build-location-coordinate-index.js';
import { buildVisualMapLayer } from './build-visual-map-layer.js';
import type { VisualMapLayer } from '../domain/output.js';

async function buildLayer(): Promise<VisualMapLayer> {
  const jvtoWeb = await extractJvtoWeb();
  const index = buildLocationCoordinateIndex(jvtoWeb.destination_details);
  const [layer] = buildVisualMapLayer(index);
  return layer;
}

const EXPECTED_COORDS: Record<string, { lat: number; lng: number }> = {
  bromo: { lat: -7.942, lng: 112.953 },
  madakaripura: { lat: -7.933, lng: 113.008 },
  ijen: { lat: -8.058, lng: 114.242 }
};

const TRANSIT_NODES = ['surabaya_airport', 'bondowoso_ijen_area', 'ketapang_harbor'];

test('destination markers carry verified jvto-web coordinates', async () => {
  const layer = await buildLayer();
  for (const [ref, want] of Object.entries(EXPECTED_COORDS)) {
    const point = layer.points.find((p) => p.location_ref === ref);
    assert.ok(point, `missing point ${ref}`);
    assert.equal(point.lat, want.lat, `lat for ${ref}`);
    assert.equal(point.lng, want.lng, `lng for ${ref}`);
    assert.equal(point.geo_status, 'verified_jvto_web');
    assert.equal(point.geo_source, 'jvto_web');
  }
});

test('transit nodes stay explicit gaps (no invented coordinates)', async () => {
  const layer = await buildLayer();
  for (const ref of TRANSIT_NODES) {
    const point = layer.points.find((p) => p.location_ref === ref);
    assert.ok(point, `missing point ${ref}`);
    assert.equal(point.lat, null, `${ref} lat must be null`);
    assert.equal(point.lng, null, `${ref} lng must be null`);
    assert.equal(point.geo_status, 'needs_verified_geocode');
    assert.equal(point.geo_source, null);
  }
});

test('route_lines only emit geometry between two verified endpoints, always flagged not-road', async () => {
  const layer = await buildLayer();
  const lines = layer.route_lines ?? [];
  assert.equal(lines.length, 5);
  for (const line of lines) {
    assert.equal(line.not_road_geometry, true);
    // distance/duration labels come from the researched route-leg index.
    assert.equal(typeof line.distance_km, 'number');
    assert.equal(typeof line.duration_normal_minutes, 'number');
    if (line.coordinates) {
      assert.equal(line.geometry_status, 'placeholder_from_verified_endpoints');
      assert.equal(line.geometry_type, 'great_circle_placeholder');
      assert.equal(line.coordinates.length, 2);
    } else {
      assert.equal(line.geometry_status, 'needs_endpoint_coordinates');
      assert.equal(line.geometry_type, null);
    }
  }
  const withGeometry = lines.filter((l) => l.coordinates);
  assert.equal(withGeometry.length, 1, 'only bromo->madakaripura has both endpoints verified');
  assert.equal(withGeometry[0].leg_id, 'bromo_area_to_madakaripura');
});

test('bounds enclose every located marker', async () => {
  const layer = await buildLayer();
  const located = layer.points.filter((p) => p.lat != null && p.lng != null);
  assert.ok(layer.bounds, 'bounds should be present');
  for (const p of located) {
    assert.ok(p.lat! >= layer.bounds.south && p.lat! <= layer.bounds.north, 'lat within bounds');
    assert.ok(p.lng! >= layer.bounds.west && p.lng! <= layer.bounds.east, 'lng within bounds');
  }
});

test('source_trace credits the verified jvto-web coordinate source', async () => {
  const layer = await buildLayer();
  const coordTrace = layer.source_trace.find(
    (t) => t.source === 'jvto_web' && t.confidence === 'verified' && t.field?.includes('latitude')
  );
  assert.ok(coordTrace, 'expected a verified jvto_web coordinate source_trace entry');
});

test('layer is deterministic and free of PII name keys', async () => {
  const a = JSON.stringify(await buildLayer());
  const b = JSON.stringify(await buildLayer());
  assert.equal(a, b, 'two builds must be byte-identical');
  assert.equal(/"name"\s*:/.test(a), false, 'no name key allowed');
});
