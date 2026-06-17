import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceContractIntake } from '../compile/build-source-contract-intake.js';

const { readiness, skeleton } = await buildSourceContractIntake();

// Forbidden PII / customer-domain key fragments (Phase 6A guard).
const PII_FRAGMENTS = [
  'customer',
  'guest',
  'email',
  'phone',
  'whatsapp',
  'passport',
  'invoice',
  'payment',
  'booking_id',
  'document',
  'attachment',
  'contact'
];
// Fields Phase 6A must NOT infer yet.
const FORBIDDEN_INFERENCE_KEYS = ['route_node_id', 'cost', 'fatigue', 'recommendation', 'pickup_feasible', 'dropoff_feasible', 'hotel_area'];

function assertNoForbiddenKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoForbiddenKeys(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    const lk = k.toLowerCase();
    assert.ok(!PII_FRAGMENTS.some((f) => lk.includes(f)), `PII fragment in key "${k}" at ${path}`);
    assert.ok(!FORBIDDEN_INFERENCE_KEYS.includes(lk), `forbidden inferred key "${k}" at ${path}`);
    assertNoForbiddenKeys(v, `${path}.${k}`);
  }
}

test('readiness report: required sources available + schema valid', () => {
  assert.equal(readiness.schema_version, 'itinerary-core-source-contract-readiness/v1');
  const s = readiness.sources;
  assert.equal(s.llm_wiki_package_operational_days.status, 'available');
  assert.equal(s.llm_wiki_package_operational_days.schema_valid, true);
  assert.equal(s.llm_wiki_package_operational_days.record_count, 57);
  assert.equal(s.jvto_web_package_activity_snapshots.status, 'available');
  assert.equal(s.jvto_web_package_activity_snapshots.schema_valid, true);
  assert.equal(s.jvto_web_package_activity_snapshots.package_count, 16);
  assert.equal(s.jvto_web_package_activity_snapshots.day_count, 57);
  assert.equal(s.jvto_web_package_activity_snapshots.activity_count, 292);
});

test('new-backoffice cost reference: optional, marked missing not failed', () => {
  const bo = readiness.sources.new_backoffice_cost_reference_rates;
  assert.equal(bo.status, 'missing_optional_source');
  assert.equal(readiness.quality_report.critical_count, 0);
  assert.ok(readiness.quality_report.warnings.some((w) => /cost-reference-rates\.json not available/.test(w)));
});

test('joinability: raw package_id join is 0, canonical reconciliation recovers all days', () => {
  const j = readiness.joinability;
  assert.equal(j.join_key, 'canonical_catalog_key+day');
  // raw cross-namespace join must collapse to 0 — this is why reconciliation is required
  assert.equal(j.raw_join_count, 0);
  // canonical catalog reconciliation joins every day on both sides
  assert.equal(j.resolved_join_count, 57);
  assert.equal(j.matched_days, 57);
  assert.equal(j.llm_wiki_days, 57);
  assert.equal(j.jvto_web_days, 57);
  assert.deepEqual(j.unresolved_llm_wiki_package_ids, []);
  assert.deepEqual(j.unresolved_jvto_web_package_ids, []);
  assert.deepEqual(j.missing_in_llm_wiki, []);
  assert.deepEqual(j.missing_in_jvto_web, []);
});

test('skeleton: one record per resolved catalog_key+day, both sources joined, raw ids preserved', () => {
  assert.equal(skeleton.length, 57);
  for (const r of skeleton) {
    assert.ok(r.catalog_package_key.includes('/'), `catalog key not canonical: ${r.catalog_package_key}`);
    assert.equal(typeof r.day, 'number');
    // fully joined: both source ids present + both bases listed
    assert.equal(typeof r.llm_wiki_package_id, 'string');
    assert.equal(typeof r.jvto_web_package_id, 'string');
    assert.deepEqual(r.missing_sources, []);
    assert.ok(r.source_basis.includes('llm-wiki.package-operational-days'));
    assert.ok(r.source_basis.includes('jvto-web.packageActivitySnapshots'));
    assert.ok(['hotel', 'no_overnight', 'overnight_in_vehicle', 'return_same_day', 'unknown'].includes(r.overnight_status));
    assert.ok(Array.isArray(r.meal_codes));
    // activities carry their source labels, never invented time/cost
    for (const a of r.activities) {
      assert.equal(typeof a.activity_order, 'number');
      assert.equal(a.source_basis, 'packageDetailSnapshots.itineraryDays.activities');
    }
  }
});

test('skeleton: activities sorted by activity_order; records sorted by key then day', () => {
  for (const r of skeleton) {
    const orders = r.activities.map((a) => a.activity_order);
    assert.deepEqual(orders, [...orders].sort((x, y) => x - y), `activities unsorted in ${r.catalog_package_key} d${r.day}`);
  }
  const keyDay = skeleton.map((r) => `${r.catalog_package_key}|${String(r.day).padStart(3, '0')}`);
  assert.deepEqual(keyDay, [...keyDay].sort(), 'skeleton not stably sorted by key+day');
});

test('day_flow: derived from sequence + overnight_status, internally consistent', () => {
  const DISP = new Set(['overnight_hotel', 'continue_onward', 'trip_end', 'unknown']);
  const CO = new Set(['none', 'checkout_then_continue', 'checkout_at_end']);
  for (const r of skeleton) {
    const f = r.day_flow;
    assert.ok(DISP.has(f.day_end_disposition), `bad disposition in ${r.catalog_package_key} d${r.day}`);
    assert.ok(CO.has(f.checkout_mode));
    assert.equal(f.returns_to_hotel, f.day_end_disposition === 'overnight_hotel');
    if (r.overnight_status === 'hotel') assert.equal(f.returns_to_hotel, true);
    if (r.overnight_status === 'no_overnight') assert.equal(f.returns_to_hotel, false);
    assert.equal(f.derived_from, 'activity_sequence+overnight_status');
  }
});

test('day_flow: no hotel return when continuing onward (Ijen -> Bali pattern)', () => {
  const d = skeleton.find((r) => r.slug === 'bromo-ijen-3d2n' && r.day === 3);
  assert.ok(d, 'expected bromo-ijen-3d2n day 3');
  assert.equal(d!.overnight_status, 'no_overnight');
  assert.equal(d!.day_flow.returns_to_hotel, false);
  assert.equal(d!.day_flow.day_end_disposition, 'continue_onward');
  // at least one day exhibits same-day checkout before continuing (luggage travels with guest)
  assert.ok(skeleton.some((r) => r.day_flow.checkout_mode === 'checkout_then_continue'));
});

test('schedule: arrival/departure roles per package + leg-duration dependency flagged', () => {
  const byPkg = new Map<string, typeof skeleton>();
  for (const r of skeleton) {
    const list = byPkg.get(r.catalog_package_key) ?? [];
    list.push(r);
    byPkg.set(r.catalog_package_key, list);
  }
  for (const [key, days] of byPkg) {
    const sorted = [...days].sort((a, b) => a.day - b.day);
    assert.equal(sorted[0].schedule.role, 'arrival', `first day not arrival in ${key}`);
    if (sorted.length > 1) {
      assert.equal(sorted[sorted.length - 1].schedule.role, 'departure', `last day not departure in ${key}`);
    }
    for (const r of sorted) {
      assert.ok(['arrival', 'departure', 'intermediate'].includes(r.schedule.role));
      assert.equal(r.schedule.needs_leg_duration, r.schedule.time_sensitive);
      assert.equal(r.schedule.basis, 'day_position+day_flow');
    }
  }
  // a return-to-gateway departure day is time-sensitive and flags that a safe flight
  // buffer needs leg-duration data (the route_legs gap) — never invented here
  assert.ok(
    skeleton.some((r) => r.schedule.role === 'departure' && r.schedule.time_sensitive && r.schedule.needs_leg_duration),
    'expected a departure day flagged for leg-duration-based buffer'
  );
});

test('no PII / forbidden-inference keys anywhere in outputs', () => {
  assertNoForbiddenKeys(readiness);
  assertNoForbiddenKeys(skeleton);
});

test('deterministic: two builds produce byte-identical JSON', async () => {
  const a = await buildSourceContractIntake();
  const b = await buildSourceContractIntake();
  assert.equal(JSON.stringify(a.readiness), JSON.stringify(b.readiness));
  assert.equal(JSON.stringify(a.skeleton), JSON.stringify(b.skeleton));
});
