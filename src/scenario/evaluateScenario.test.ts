import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../utils/fs.js';
import { GENERATED_DIR } from '../config/paths.js';
import { loadDatasets, evaluateScenario, type ScenarioEvaluation } from './evaluateScenario.js';
import type { ItineraryScenario } from '../domain/itinerary.js';

const SAMPLES = 'samples';
const datasets = await loadDatasets();
const canonicalCostIds = new Set((await readJson<Array<{ id: string }>>(`${GENERATED_DIR}/10-cost-components.json`)).map((c) => c.id));
const legIds = new Set((await readJson<Array<{ id: string }>>(`${GENERATED_DIR}/04-route-leg-index.json`)).map((l) => l.id));
const eventIds = new Set((await readJson<Array<{ id: string }>>(`${GENERATED_DIR}/07-operational-events.json`)).map((e) => e.id));

const PII_KEYS = new Set([
  'name', 'full_name', 'customer_name', 'guest_name', 'email', 'email_address',
  'phone', 'phone_number', 'mobile', 'whatsapp', 'whatsapp_number', 'passport',
  'passport_number', 'contact_name', 'contact_phone'
]);

async function evalSample(file: string): Promise<ScenarioEvaluation> {
  const scenario = await readJson<ItineraryScenario>(`${SAMPLES}/${file}`);
  return evaluateScenario(scenario, datasets);
}

function assertNoPii(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoPii(v, `${path}[${i}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    assert.ok(!PII_KEYS.has(k.toLowerCase()), `raw PII key "${k}" found in output at ${path}`);
    assertNoPii(v, `${path}.${k}`);
  }
}

const ALL_SAMPLES = [
  'customer-scenario-surabaya-bromo-ijen-ketapang.json',
  'customer-scenario-bali-ijen-bromo-surabaya.json',
  'customer-scenario-tumpak-sewu-add-on.json',
  'customer-scenario-surabaya-airport-late-bromo-ijen-ketapang.json',
  'customer-scenario-surabaya-hotel-early-bromo-ijen-bali.json',
  'customer-scenario-impossible-late-arrival-early-dropoff.json'
];

const VALID_STATUS = new Set(['recommended', 'possible_with_warning', 'not_recommended', 'needs_manual_review']);

// ── Acceptance: specific statuses ──
test('late airport -> Ketapang returns possible_with_warning', async () => {
  const r = await evalSample('customer-scenario-surabaya-airport-late-bromo-ijen-ketapang.json');
  assert.equal(r.status, 'possible_with_warning');
  assert.ok(r.warnings.length > 0, 'expected at least one warning');
});

test('early hotel -> Bali returns recommended', async () => {
  const r = await evalSample('customer-scenario-surabaya-hotel-early-bromo-ijen-bali.json');
  assert.equal(r.status, 'recommended');
  assert.equal(r.warnings.length, 0, 'expected no warnings');
});

test('impossible 1-day multi-destination returns not_recommended', async () => {
  const r = await evalSample('customer-scenario-impossible-late-arrival-early-dropoff.json');
  assert.equal(r.status, 'not_recommended');
});

// ── All samples: shape + joinability + PII ──
for (const file of ALL_SAMPLES) {
  test(`sample evaluates with valid joinable shape: ${file}`, async () => {
    const r = await evalSample(file);
    assert.ok(VALID_STATUS.has(r.status), `invalid status ${r.status}`);
    assert.ok(Array.isArray(r.recommended_route));
    assert.ok(Array.isArray(r.route_leg_ids));
    assert.ok(Array.isArray(r.warnings));
    assert.ok(Array.isArray(r.cost_components));
    assert.ok(Array.isArray(r.source_trace) && r.source_trace.length > 0);

    for (const id of r.cost_components) {
      assert.equal(typeof id, 'string', 'cost_components must be string IDs');
      assert.ok(canonicalCostIds.has(id), `cost_component "${id}" not joinable to 10-cost-components.json`);
    }
    for (const id of r.route_leg_ids) {
      assert.ok(legIds.has(id), `route_leg "${id}" not joinable to 04-route-leg-index.json`);
    }
    for (const id of r.operational_events) {
      assert.ok(eventIds.has(id), `operational_event "${id}" not joinable to 07-operational-events.json`);
    }
    assertNoPii(r);
  });
}
