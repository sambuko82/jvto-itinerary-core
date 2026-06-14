import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../utils/fs.js';
import { evaluateScenario } from './index.js';
import type { RawScenarioInput } from './types.js';

async function knownCostComponentIds(): Promise<Set<string>> {
  const rows = await readJson<Array<{ id: string }>>(
    'generated/itinerary-intelligence/10-cost-components.json'
  );
  return new Set(rows.map((r) => r.id));
}

const RAW_PII_KEYS = new Set([
  'name',
  'full_name',
  'customer_name',
  'guest_name',
  'email',
  'email_address',
  'phone',
  'phone_number',
  'mobile',
  'mobile_number',
  'whatsapp',
  'whatsapp_number',
  'passport',
  'passport_number',
  'contact_name',
  'contact_phone'
]);

function assertNoRawPii(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawPii(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert.ok(!RAW_PII_KEYS.has(key.toLowerCase()), `raw PII key "${key}" found at ${path}`);
    assertNoRawPii(nested, `${path}.${key}`);
  }
}

test('late Surabaya-airport → Ketapang scenario is possible_with_warning', async () => {
  const raw = await readJson<RawScenarioInput>(
    'samples/customer-scenario-surabaya-airport-late-bromo-ijen-ketapang.json'
  );
  const result = await evaluateScenario(raw);

  assert.equal(result.status, 'possible_with_warning');
  assert.ok(result.warnings.some((w) => /late|rest|fatigue|arriv/i.test(w)), 'expected a late-arrival/fatigue warning');

  // West-to-east route: Bromo before Ijen, ending at Ketapang.
  const bromoIdx = result.recommended_route.findIndex((a) => /bromo/i.test(a));
  const ijenIdx = result.recommended_route.findIndex((a) => /ijen/i.test(a));
  assert.ok(bromoIdx >= 0 && ijenIdx > bromoIdx, 'expected Bromo before Ijen');
  assert.ok(/ketapang/i.test(result.recommended_route[result.recommended_route.length - 1]), 'expected Ketapang dropoff');

  // Ijen operational events present.
  assert.ok(result.operational_events.some((e) => /ijen|medical|bondowoso/i.test(e)), 'expected Ijen operational events');

  // Cost components are defined IDs only (joinable to 10-cost-components.json), no final pricing.
  assert.ok(result.cost_components.length > 0);
  assert.ok(result.cost_components.every((c) => typeof c === 'string'));
  assert.ok(result.cost_components.includes('ijen_local_guide'));
  const known = await knownCostComponentIds();
  for (const id of result.cost_components) {
    assert.ok(known.has(id), `cost component "${id}" must be defined in 10-cost-components.json`);
  }

  assertNoRawPii(result);
});

test('Surabaya-hotel night start → Bali scenario is recommended', async () => {
  const raw = await readJson<RawScenarioInput>(
    'samples/customer-scenario-surabaya-hotel-early-bromo-ijen-bali.json'
  );
  const result = await evaluateScenario(raw);

  assert.equal(result.status, 'recommended');
  assert.equal(result.warnings.length, 0, 'expected no risk warnings for a deliberate night start');
  assert.ok(result.better_route_notes.some((n) => /west|backtrack|ketapang|bali/i.test(n)), 'expected west-to-east guidance');
  // Only Bromo + Ijen were requested — the route must not inject the unrequested Madakaripura stop.
  assert.ok(!result.recommended_route.some((a) => /madakaripura/i.test(a)), 'must not include unrequested Madakaripura');
  assert.ok(!result.cost_components.some((c) => /madakaripura/i.test(c)), 'must not cost unrequested Madakaripura');
  assertNoRawPii(result);
});

test('Bali-hotel pickup (unsupported location) needs_manual_review', async () => {
  const raw = await readJson<RawScenarioInput>('samples/customer-scenario-bali-ijen-bromo-surabaya.json');
  const result = await evaluateScenario(raw);
  assert.equal(result.status, 'needs_manual_review');
  // Route must not start in Surabaya just because the pickup type word "hotel" matched a Surabaya context.
  assert.ok(!/surabaya/i.test(result.recommended_route[0]), 'pickup must not resolve to a phantom Surabaya start');
  assertNoRawPii(result);
});

test('1-day Bromo+Ijen with same-day airport dropoff is not_recommended', async () => {
  const raw = await readJson<RawScenarioInput>(
    'samples/customer-scenario-impossible-late-arrival-early-dropoff.json'
  );
  const result = await evaluateScenario(raw);

  assert.equal(result.status, 'not_recommended');
  assert.ok(result.warnings.some((w) => /day|night|require|overnight/i.test(w)), 'expected an infeasibility reason');
  assert.equal(result.cost_components.every((c) => typeof c === 'string'), true);
  assertNoRawPii(result);
});
