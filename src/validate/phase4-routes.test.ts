import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { validateItineraryIntelligence } from './validate-itinerary-intelligence.js';

const legs = await readJson<Array<Record<string, unknown>>>(`${GENERATED_DIR}/route-leg-index.json`);
const routes = await readJson<Array<Record<string, unknown>>>(`${GENERATED_DIR}/package-route-map.json`);
const nodes = await readJson<Array<{ node_id: string }>>(`${GENERATED_DIR}/route-node-index.json`);
const catalog = await readJson<unknown[]>(`${GENERATED_DIR}/package-catalog-index.json`);
const knownNodes = new Set(nodes.map((n) => n.node_id));

const PII_KEYS = new Set(['name', 'customer_name', 'email', 'phone', 'whatsapp', 'passport', 'booking_code']);
function assertNoPiiKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoPiiKeys(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    assert.ok(!PII_KEYS.has(k.toLowerCase()), `PII key "${k}" at ${path}`);
    assertNoPiiKeys(v, `${path}.${k}`);
  }
}

test('every route leg connects known nodes; ids unique (deduplicated)', () => {
  const ids = legs.map((l) => l.route_leg_id);
  assert.equal(new Set(ids).size, ids.length, 'route_leg_id must be unique');
  for (const l of legs) {
    assert.ok(knownNodes.has(String(l.from_node)), `unknown from_node ${l.from_node}`);
    assert.ok(knownNodes.has(String(l.to_node)), `unknown to_node ${l.to_node}`);
    assert.ok(Array.isArray(l.source_trace) && (l.source_trace as unknown[]).length > 0);
  }
});

test('repeated legs are deduplicated with aggregated used_by_packages', () => {
  const sby2ijen = legs.find((l) => l.route_leg_id === 'surabaya__to__ijen');
  assert.ok(sby2ijen);
  // shared by multiple packages -> aggregated, not duplicated
  assert.ok((sby2ijen.used_by_packages as string[]).length > 1);
});

test('distance and duration are never guessed (null + flagged missing)', () => {
  for (const l of legs) {
    assert.equal(l.distance_km_operator, null);
    assert.equal(l.distance_km_mapbox, null);
    assert.equal(l.duration_minutes_operator, null);
    assert.equal(l.duration_minutes_mapbox, null);
    const mf = l.missing_fields as string[];
    assert.ok(mf.includes('distance_km_operator') && mf.includes('duration_minutes_operator'));
  }
});

test('legs touching ambiguous nodes are flagged', () => {
  const compound = legs.find((l) => l.route_leg_id === 'tumpak__to__sewu');
  assert.ok(compound);
  assert.equal(compound.touches_ambiguous_node, true);
});

test('package route sequences exist and reference only legs in the index', () => {
  assert.equal(routes.length, catalog.length);
  assert.equal(routes.length, 16);
  const legSet = new Set(legs.map((l) => l.route_leg_id));
  for (const r of routes) {
    const seq = r.route_sequence as string[];
    assert.ok(seq.length >= 1, `empty sequence for ${r.package_id}`);
    assert.equal(r.leg_count, seq.length - 1);
    for (const lid of r.route_leg_ids as string[]) {
      assert.ok(legSet.has(lid), `orphan leg ${lid} in ${r.package_id}`);
    }
  }
  const single = routes.find((r) => r.package_id === 'bromo-1d1n');
  assert.deepEqual(single?.route_sequence, ['surabaya', 'bromo']);
});

test('no PII keys in route outputs', () => {
  assertNoPiiKeys(legs);
  assertNoPiiKeys(routes);
});

test('validation-report has 0 critical errors after Phase 4', async () => {
  const report = await validateItineraryIntelligence();
  assert.equal(report.summary.critical, 0);
  assert.equal(report.status, 'pass');
});
