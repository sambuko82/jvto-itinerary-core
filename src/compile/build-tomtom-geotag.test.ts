import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTomTomGeotagIndex } from './build-tomtom-geotag.js';

test('builds deterministic index from static seed', async () => {
  const a = JSON.stringify((await buildTomTomGeotagIndex()).index);
  const b = JSON.stringify((await buildTomTomGeotagIndex()).index);
  assert.equal(a, b);
});

test('surabaya_airport carries TomTom-verified coordinate', async () => {
  const { index } = await buildTomTomGeotagIndex();
  const node = index.nodes.find((n) => n.node_id === 'surabaya_airport');
  assert.ok(node, 'surabaya_airport node missing');
  assert.equal(node.lat, -7.3748);
  assert.equal(node.lng, 112.7949);
  assert.equal(node.confidence, 'verified_tomtom_api');
  assert.equal(node.tomtom_category, 'PUBLIC_AIRPORT');
  assert.ok(node.entry_point !== null, 'surabaya_airport must have an entry_point');
});

test('bondowoso carries TomTom municipality geocode and bondowoso_ijen_area alias', async () => {
  const { index, nodeIndex } = await buildTomTomGeotagIndex();
  const node = index.nodes.find((n) => n.node_id === 'bondowoso');
  assert.ok(node, 'bondowoso node missing');
  assert.equal(node.lat, -7.9111849);
  assert.equal(node.confidence, 'verified_tomtom_api');
  // Alias must resolve to the same node
  const aliasNode = nodeIndex.byNodeId.get('bondowoso_ijen_area');
  assert.ok(aliasNode, 'bondowoso_ijen_area alias not registered');
  assert.equal(aliasNode.node_id, 'bondowoso');
});

test('ketapang_harbor carries TomTom FERRY_TERMINAL coordinate', async () => {
  const { index } = await buildTomTomGeotagIndex();
  const node = index.nodes.find((n) => n.node_id === 'ketapang_harbor');
  assert.ok(node, 'ketapang_harbor node missing');
  assert.equal(node.tomtom_category, 'FERRY_TERMINAL');
  assert.ok(node.entry_point !== null, 'ketapang_harbor must have an entry_point');
  assert.equal(node.lat, -8.142967);
});

test('index has no PII name keys', async () => {
  const { index } = await buildTomTomGeotagIndex();
  const str = JSON.stringify(index);
  assert.equal(/"name"\s*:/.test(str), false, 'no name key allowed in geotag index');
});

test('fill_status is seed_only when no routing fill supplied', async () => {
  const { index } = await buildTomTomGeotagIndex();
  assert.equal(index.fill_status, 'seed_only');
  assert.equal(index.routed_legs.length, 0);
  assert.equal(index.fill_generated_at, null);
});

test('all 17 expected nodes are present', async () => {
  const EXPECTED_NODE_IDS = [
    'surabaya_airport', 'surabaya', 'malang', 'probolinggo', 'bromo',
    'madakaripura', 'bondowoso', 'ijen', 'ketapang_harbor', 'gilimanuk_harbor',
    'bali', 'denpasar_airport', 'tumpak_sewu', 'jember', 'papuma',
    'baluran', 'taman_safari_prigen'
  ];
  const { index } = await buildTomTomGeotagIndex();
  const ids = new Set(index.nodes.map((n) => n.node_id));
  for (const id of EXPECTED_NODE_IDS) {
    assert.ok(ids.has(id), `missing node ${id}`);
  }
});

test('nodeIndex lookup works for direct node_id', async () => {
  const { nodeIndex } = await buildTomTomGeotagIndex();
  const node = nodeIndex.byNodeId.get('surabaya_airport');
  assert.ok(node);
  assert.equal(node.node_id, 'surabaya_airport');
});

test('fill_status is routing_filled when routingFill supplied', async () => {
  const fakeLeg = {
    leg_id: 'surabaya_airport_to_bromo_area',
    from_node_id: 'surabaya_airport',
    to_node_id: 'bromo',
    distance_km_tomtom: 118.6,
    duration_normal_minutes_tomtom: 157,
    duration_busy_minutes_tomtom: null,
    geometry_type: 'tomtom_routed_polyline' as const,
    coordinates: [[-7.3748, 112.7949], [-7.9046, 112.9525]] as [number, number][],
    routing_source: 'tomtom_routing_api_v1' as const,
    traffic_model: 'live' as const,
    routed_at: '2026-07-03T00:00:00.000Z'
  };
  const { index } = await buildTomTomGeotagIndex([fakeLeg]);
  assert.equal(index.fill_status, 'routing_filled');
  assert.equal(index.routed_legs.length, 1);
  assert.equal(index.fill_generated_at, '2026-07-03T00:00:00.000Z');
});
