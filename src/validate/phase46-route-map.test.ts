import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { validateItineraryIntelligence } from './validate-itinerary-intelligence.js';

const routes = await readJson<Array<Record<string, any>>>(`${GENERATED_DIR}/package-route-map.json`);
const opcontext = await readJson<Array<Record<string, any>>>(`${GENERATED_DIR}/operational-context-gap-report.json`);
const nodes = await readJson<Array<{ node_id: string }>>(`${GENERATED_DIR}/route-node-index.json`);

const VALID_BASIS = new Set(['source_grouped_sequence', 'slug_token_fallback']);
const VALID_STRENGTH = new Set(['confirmed', 'supported', 'title_supported', 'fallback', 'unresolved']);
const VALID_STATUS = new Set(['confirmed', 'supported', 'incomplete']);

test('package-route-map has fresh source-backed metadata, no stale fields', () => {
  for (const r of routes) {
    assert.ok(VALID_BASIS.has(r.sequence_basis), `bad sequence_basis ${r.sequence_basis} on ${r.package_id}`);
    assert.notEqual(r.sequence_basis, 'slug_token_order_from_catalog');
    assert.ok(!(r.missing_fields as string[]).includes('travel_direction_confirmation'));
    assert.ok(VALID_STRENGTH.has(r.route_source_strength));
    assert.ok(VALID_STATUS.has(r.route_map_status));
    assert.ok(r.route_leg_source_summary && typeof r.route_leg_source_summary === 'object');
    assert.equal(typeof r.unresolved_movement_count, 'number');
    assert.ok(Array.isArray(r.source_backed_compound_nodes));
  }
});

test('a TravelAction leg forces route_source_strength confirmed', () => {
  for (const r of routes) {
    if (r.route_leg_source_summary.jvto_web_travel_action > 0) {
      assert.equal(r.route_source_strength, 'confirmed');
      assert.equal(r.route_map_status, 'confirmed');
    }
  }
});

test('operational context handoff captures every unresolved movement label', () => {
  const handed = new Set(opcontext.map((o) => o.label));
  for (const r of routes) {
    for (const lab of r.unresolved_movement_labels as string[]) {
      assert.ok(handed.has(lab), `unhanded label ${lab}`);
    }
  }
  assert.ok(opcontext.length > 0);
});

test('operational labels classified, routed to Phase 5, and NOT promoted to nodes', () => {
  const nodeIds = new Set(nodes.map((n) => n.node_id));
  for (const o of opcontext) {
    assert.equal(o.resolution_status, 'pending_phase5');
    assert.ok(['harbor', 'airport', 'hotel_area', 'city_area', 'staging_area', 'unknown'].includes(o.likely_context_type));
    assert.ok(['pickup-contexts', 'dropoff-contexts', 'staging-area-contexts', 'location-alias-registry', 'route-node-index'].includes(o.recommended_phase5_dataset));
    assert.ok(Array.isArray(o.source_trace) && o.source_trace.length > 0);
    assert.ok(!nodeIds.has(o.normalized_candidate_id), `operational label promoted to node: ${o.label}`);
  }
  // sanity: airport classified correctly (not harbor via "port" substring)
  assert.equal(opcontext.find((o) => o.label === 'Juanda Airport')?.likely_context_type, 'airport');
  assert.equal(opcontext.find((o) => o.label === 'Ketapang Port')?.likely_context_type, 'harbor');
});

test('validation passes with 0 critical after Phase 4.6', async () => {
  const report = await validateItineraryIntelligence();
  assert.equal(report.summary.critical, 0);
  assert.equal(report.status, 'pass');
});
