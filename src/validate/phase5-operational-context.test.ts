import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { validateItineraryIntelligence } from './validate-itinerary-intelligence.js';

const G = GENERATED_DIR;
const gap = await readJson<Array<Record<string, any>>>(`${G}/operational-context-gap-report.json`);
const index = await readJson<Array<Record<string, any>>>(`${G}/operational-context-index.json`);
const pickup = await readJson<Array<Record<string, any>>>(`${G}/pickup-contexts.json`);
const dropoff = await readJson<Array<Record<string, any>>>(`${G}/dropoff-contexts.json`);
const staging = await readJson<Array<Record<string, any>>>(`${G}/staging-area-contexts.json`);
const timeRules = await readJson<Array<Record<string, any>>>(`${G}/time-window-rules.json`);
const nodeReview = await readJson<Array<Record<string, any>>>(`${G}/route-node-candidate-review.json`);
const resolution = await readJson<Array<Record<string, any>>>(`${G}/operational-context-resolution-report.json`);
const nodes = await readJson<Array<{ node_id: string }>>(`${G}/route-node-index.json`);

const PII_KEYS = new Set(['name', 'customer_name', 'email', 'phone', 'whatsapp', 'passport', 'booking_code']);
function assertNoPiiKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoPiiKeys(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    assert.ok(!PII_KEYS.has(k.toLowerCase()), `PII key "${k}" at ${path}`);
    assertNoPiiKeys(v, `${path}.${k}`);
  }
}

test('all 14 handoff labels accounted for in index + resolution report', () => {
  const labels = new Set(gap.map((g) => g.label));
  assert.equal(labels.size, 14);
  assert.equal(index.length, 14);
  assert.equal(resolution.length, 14);
  const resolved = new Set(resolution.map((r) => r.label));
  for (const l of labels) assert.ok(resolved.has(l), `missing ${l} in resolution report`);
});

test('every operational record has source_trace', () => {
  for (const rec of [...index, ...pickup, ...dropoff, ...staging, ...timeRules, ...nodeReview, ...resolution]) {
    assert.ok(Array.isArray(rec.source_trace) && rec.source_trace.length > 0, `no source_trace on ${rec.id}`);
  }
});

test('pickup/dropoff/staging skeletons generated with no invented buffers', () => {
  assert.equal(pickup.length, 2);
  assert.equal(dropoff.length, 5);
  assert.equal(staging.length, 1);
  for (const p of pickup) {
    assert.deepEqual(p.rules, []); // no invented buffers
    assert.ok((p.missing_fields as string[]).some((m) => /buffer|operational_rule_source/.test(m)));
  }
  // harbors land in dropoff
  assert.ok(dropoff.some((d) => d.label === 'Ketapang Port' && d.context_type === 'harbor'));
});

test('time-window-rules use source buckets only, never exact times', () => {
  assert.ok(timeRules.length > 0);
  for (const r of timeRules) {
    assert.equal(r.exact_time_available, false);
    assert.ok(['pickup_time_bucket', 'airport_handoff_context', 'harbor_crossing_context', 'hotel_staging_context', 'unknown_time_context'].includes(r.rule_type));
  }
  // backoffice buckets surfaced verbatim
  const buckets = timeRules.filter((r) => r.rule_type === 'pickup_time_bucket').map((r) => r.source_time_bucket);
  assert.ok(buckets.includes('midday') && buckets.includes('evening_night'));
});

test('route-node candidates resolved with joinable, consistent decisions, none promoted', () => {
  assert.equal(nodeReview.length, 4);
  const nodeIds = new Set(nodes.map((n) => n.node_id));
  const decisions = new Set(['reject_existing_alias', 'hold_for_future']);
  const resByLabel = new Map(resolution.map((r) => [r.label, r]));
  for (const c of nodeReview) {
    assert.equal(c.review_status, 'resolved');
    assert.ok(decisions.has(c.route_node_decision), `unexpected decision ${c.route_node_decision} for ${c.label}`);
    assert.notEqual(c.route_node_decision, 'promote'); // never auto-promoted
    assert.ok(typeof c.decision_basis === 'string' && c.decision_basis.length > 0, `no basis for ${c.label}`);
    assert.ok(!nodeIds.has(c.normalized_candidate_id), `promoted ${c.label}`);
    // a rejection must point at a real, joinable route-node-index node
    if (c.route_node_decision === 'reject_existing_alias') {
      assert.ok(nodeIds.has(c.resolved_to_node), `resolved_to_node ${c.resolved_to_node} not in route-node-index`);
    } else {
      assert.equal(c.resolved_to_node, null);
    }
    // resolution report stays in sync — no contradictory pending row for the label
    const r = resByLabel.get(c.label);
    assert.equal(r?.resolution_status, 'resolved', `resolution report still pending for ${c.label}`);
    assert.ok(!(r?.remaining_missing_fields ?? []).includes('route_node_decision'));
  }
  // Batu is an alias of the existing 'malang' route node (crosswalk malang_batu -> malang).
  const batu = nodeReview.find((c) => c.normalized_candidate_id === 'batu');
  assert.equal(batu?.route_node_decision, 'reject_existing_alias');
  assert.equal(batu?.resolved_to_node, 'malang');
  // Prigen Safari Park is an alias of the existing 'taman_safari_prigen' node (label mapping).
  const prigen = nodeReview.find((c) => c.normalized_candidate_id === 'prigen_safari_park');
  assert.equal(prigen?.route_node_decision, 'reject_existing_alias');
  assert.equal(prigen?.resolved_to_node, 'taman_safari_prigen');
  // route-node-index untouched (2 origins + 7 source-backed destinations = 9)
  assert.equal(nodes.length, 9);
  assert.ok(!nodes.some((n) => ['bondowoso', 'batu', 'jember'].includes(n.node_id)));
});

test('no PII keys in any Phase 5 output', () => {
  assertNoPiiKeys([index, pickup, dropoff, staging, timeRules, nodeReview, resolution]);
});

test('validation passes with 0 critical after Phase 5', async () => {
  const report = await validateItineraryIntelligence();
  assert.equal(report.summary.critical, 0);
  assert.equal(report.status, 'pass');
});
