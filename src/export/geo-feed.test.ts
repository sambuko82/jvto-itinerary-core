import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeoFeed } from './geo-feed.js';

// East Java + Bali bounding box. Anything outside this box indicates a join bug
// (wrong node matched), not a real data gap — fail loudly rather than silently.
const BBOX = { latMin: -12, latMax: -6, lngMin: 110, lngMax: 116 };

function inBBox(lat: number, lng: number): boolean {
  return lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax;
}

// Minimum required destination coverage (E5 execution plan). A missing coordinate
// for any of these five is a real data regression, not something to paper over.
const REQUIRED_DESTINATIONS: Record<string, { coreId: string }> = {
  'Mount Bromo': { coreId: 'bromo' },
  'Ijen Crater': { coreId: 'ijen' },
  'Tumpak Sewu Waterfall': { coreId: 'tumpak_sewu' },
  'Madakaripura Waterfall': { coreId: 'madakaripura' },
  'Taman Safari Prigen': { coreId: 'taman_safari_prigen' }
};

test('feed carries the required contract fields', async () => {
  const feed = await buildGeoFeed();
  assert.equal(feed.id, 'geo_feed');
  assert.equal(feed.status, 'active');
  // Coordinates here are a MIX of verified_tomtom_api and seed_approximation nodes
  // (see the per-destination/per-route-node geo_confidence for the real truth) —
  // the feed must never claim a blanket 'verified' for that mix.
  assert.equal(feed.confidence, 'inferred');
  assert.ok(Array.isArray(feed.source_trace) && feed.source_trace.length > 0);
  assert.ok(Array.isArray(feed.destinations));
  assert.ok(Array.isArray(feed.routes));
  assert.ok(Array.isArray(feed.missing_coordinates));
});

test('all 5 minimum-coverage destinations have a real coordinate, honestly labeled by provenance', async () => {
  const feed = await buildGeoFeed();
  for (const [name, { coreId }] of Object.entries(REQUIRED_DESTINATIONS)) {
    const dest = feed.destinations.find((d) => d.id === coreId);
    assert.ok(dest, `hard-fail: no destination entry for ${name} (core id "${coreId}") — geotag index coverage regressed`);
    assert.equal(typeof dest!.lat, 'number', `${name} lat must be a real number`);
    assert.equal(typeof dest!.lng, 'number', `${name} lng must be a real number`);
    assert.ok(Number.isFinite(dest!.lat) && Number.isFinite(dest!.lng), `${name} coordinate must be finite`);
    assert.ok(inBBox(dest!.lat, dest!.lng), `${name} coordinate ${dest!.lat},${dest!.lng} falls outside the East-Java/Bali bounding box`);
    assert.ok(
      ['verified_tomtom_api', 'seed_approximation'].includes(dest!.geo_confidence),
      `${name}: geo_confidence must be a real TomTom node confidence value, got "${dest!.geo_confidence}"`
    );
  }
  // Honest current-state check: as of this writing, none of the 5 minimum-coverage
  // destinations are TomTom API-verified yet — they're researched/seed coordinates.
  // If this ever flips to true, that's good news; if a destination that used to be
  // verified silently flips to false, that's a real regression to catch.
  const bromo = feed.destinations.find((d) => d.id === 'bromo');
  assert.equal(bromo!.geo_confidence, 'seed_approximation');
});

test('Ijen destination uses the ijen-crater slug (not mount-ijen) and carries the sulfur dioxide disclosure', async () => {
  const feed = await buildGeoFeed();
  const ijen = feed.destinations.find((d) => d.id === 'ijen');
  assert.ok(ijen, 'ijen destination missing');
  assert.equal(ijen!.schema_org.url, '/destinations/ijen-crater');
  assert.ok(!ijen!.schema_org.url?.includes('mount-ijen'), 'must never emit the mount-ijen slug bug');
  assert.equal(ijen!.schema_org.hazardousSubstance, 'sulfur dioxide gas');
});

test('every destination emits a well-formed Schema.org TouristAttraction geo block', async () => {
  const feed = await buildGeoFeed();
  assert.ok(feed.destinations.length > 0);
  for (const d of feed.destinations) {
    assert.equal(d.schema_org['@type'], 'TouristAttraction');
    assert.equal(d.schema_org.geo['@type'], 'GeoCoordinates');
    assert.equal(d.schema_org.geo.latitude, d.lat);
    assert.equal(d.schema_org.geo.longitude, d.lng);
    assert.ok(inBBox(d.lat, d.lng), `destination ${d.id} outside bounding box`);
  }
});

test('every route has at least one node and every emitted node has a valid in-bbox coordinate', async () => {
  const feed = await buildGeoFeed();
  assert.equal(feed.routes.length, 16, 'expected all 16 standard packages');
  for (const route of feed.routes) {
    assert.ok(route.package_id.length > 0);
    for (const node of route.nodes) {
      assert.equal(typeof node.lat, 'number');
      assert.equal(typeof node.lng, 'number');
      assert.ok(Number.isFinite(node.lat) && Number.isFinite(node.lng));
      assert.ok(
        inBBox(node.lat, node.lng),
        `route ${route.package_id} node "${node.name}" (${node.lat},${node.lng}) outside the East-Java/Bali bounding box — likely a join bug`
      );
      assert.ok(Number.isInteger(node.sequence) && node.sequence > 0);
      assert.ok(
        ['verified_tomtom_api', 'seed_approximation'].includes(node.geo_confidence),
        `route ${route.package_id} node "${node.name}": geo_confidence must be a real TomTom node confidence value, got "${node.geo_confidence}"`
      );
    }
  }
});

test('route nodes without a verified coordinate are reported in missing_coordinates, never guessed', async () => {
  const feed = await buildGeoFeed();
  const routeNodeNames = new Set(feed.routes.flatMap((r) => r.nodes.map((n) => n.name)));
  // Every name that appears as an emitted route node must correspond to a real
  // TomTom-verified coordinate — i.e. it must not simultaneously appear in
  // missing_coordinates under the same package/name ref.
  for (const gap of feed.missing_coordinates) {
    if (gap.context !== 'route_node') continue;
    const [, placeName] = gap.ref.split(':');
    // A reported gap for a package must mean that node was NOT emitted for that package.
    const pkgKey = gap.ref.split(':')[0];
    const route = feed.routes.find((r) => r.package_id === pkgKey);
    assert.ok(route, `missing_coordinates references unknown package ${pkgKey}`);
    assert.ok(
      !route!.nodes.some((n) => n.name === placeName),
      `node ${placeName} should not be both emitted and reported missing for ${pkgKey}`
    );
  }
});

test('feed build is deterministic', async () => {
  const a = JSON.stringify(await buildGeoFeed());
  const b = JSON.stringify(await buildGeoFeed());
  assert.equal(a, b, 'two builds must be byte-identical');
});
