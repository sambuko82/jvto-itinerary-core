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
const mealIds = new Set((await readJson<Array<{ id: string }>>(`${GENERATED_DIR}/08-meal-logic.json`)).map((m) => m.id));
const accIds = new Set((await readJson<Array<{ id: string }>>(`${GENERATED_DIR}/09-accommodation-logic.json`)).map((a) => a.id));
const packageIds = new Set((await readJson<Array<{ package_id: string }>>(`${GENERATED_DIR}/11-package-route-map.json`)).map((p) => p.package_id));

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
    // new package-aware fields present + joinable
    assert.ok(Array.isArray(r.meal_logic));
    assert.ok(Array.isArray(r.accommodation_logic));
    assert.ok(r.package_route_id === null || typeof r.package_route_id === 'string');
    for (const id of r.meal_logic) assert.ok(mealIds.has(id), `meal_logic "${id}" not joinable to 08-meal-logic.json`);
    for (const id of r.accommodation_logic) assert.ok(accIds.has(id), `accommodation_logic "${id}" not joinable to 09-accommodation-logic.json`);
    assertNoPii(r);
  });
}

// ── Package-aware scenario ──
test('package_slug bromo-ijen-bali-4d3n is present in 11-package-route-map', () => {
  assert.ok(packageIds.has('bromo-ijen-bali-4d3n'));
});

test('package-aware scenario uses package route baseline and is recommended', async () => {
  const r = await evalSample('customer-scenario-package-bromo-ijen-bali-4d3n.json');
  assert.equal(r.status, 'recommended');
  assert.equal(r.package_route_id, 'bromo-ijen-bali-4d3n');
  assert.equal(r.warnings.length, 0);
  // baseline route from the package
  assert.deepEqual(r.recommended_route, [
    'Surabaya',
    'Bromo Area',
    'Bondowoso / Ijen Area',
    'Ijen Crater',
    'Ketapang Harbor',
    'Bali'
  ]);
  for (const id of r.route_leg_ids) assert.ok(legIds.has(id));
  // meal + accommodation intelligence wired
  assert.ok(r.meal_logic.includes('dinner_before_ijen'));
  assert.ok(r.accommodation_logic.includes('bondowoso_ijen_staging'));
  assert.ok(r.accommodation_logic.includes('bromo_area_sunrise_staging'));
});

test('package route conflicting with requested destination raises a warning', () => {
  // bromo-ijen-3d2n covers Bromo+Ijen only; requesting Tumpak Sewu conflicts.
  const scenario = {
    scenario_id: 'pkg_conflict',
    package_slug: 'bromo-ijen-3d2n',
    pickup: { type: 'airport', location: 'Surabaya Airport', time: '09:00' },
    dropoff: { type: 'harbor', location: 'Ketapang Harbor' },
    pax: 2,
    duration_days: 4,
    requested_destinations: ['Bromo', 'Ijen', 'Tumpak Sewu'],
    arrival_time: '09:00'
  } as ItineraryScenario;
  const r = evaluateScenario(scenario, datasets);
  assert.equal(r.package_route_id, 'bromo-ijen-3d2n');
  assert.ok(
    r.warnings.some((w) => w.includes('tumpak_sewu') && w.includes('not part of package route')),
    'expected a package-conflict warning for tumpak_sewu'
  );
});

test('no package_slug yields package_route_id null (unchanged behavior)', async () => {
  const r = await evalSample('customer-scenario-surabaya-hotel-early-bromo-ijen-bali.json');
  assert.equal(r.package_route_id, null);
});

// ── Review-comment regressions (PR #4) ──

test('Ijen scenarios emit the Ijen crater activity leg in route_leg_ids', async () => {
  const r = await evalSample('customer-scenario-surabaya-hotel-early-bromo-ijen-bali.json');
  assert.ok(
    r.route_leg_ids.includes('bondowoso_ijen_area_to_ijen_crater'),
    'expected the Ijen crater leg to be emitted for an Ijen route'
  );
  assert.ok(r.recommended_route.includes('Ijen Crater'));
});

test('Ketapang-only dropoff does not inject Bali ferry connection costs', async () => {
  const r = await evalSample('customer-scenario-surabaya-bromo-ijen-ketapang.json');
  assert.ok(
    !r.operational_events.includes('ketapang_ferry_connection'),
    'Ketapang-only dropoff should not fire the ferry connection event'
  );
  assert.ok(!r.cost_components.includes('ferry_ticket'), 'no ferry ticket cost for a Ketapang-only dropoff');
});

test('Ketapang dropoff continuing to Bali keeps the ferry connection', async () => {
  const r = await evalSample('customer-scenario-surabaya-airport-late-bromo-ijen-ketapang.json');
  assert.ok(
    r.operational_events.includes('ketapang_ferry_connection'),
    'ferry connection should fire when dropoff.next_destination is Bali'
  );
  assert.ok(r.cost_components.includes('ferry_ticket'));
});

test('Tumpak-Sewu-only scenario emits the Tumpak Sewu guide, not the Madakaripura guide', () => {
  const scenario = {
    scenario_id: 'tumpak_only',
    pickup: { type: 'airport', location: 'Surabaya Airport', time: '09:00' },
    dropoff: { type: 'harbor', location: 'Ketapang Harbor' },
    pax: 2,
    duration_days: 2,
    requested_destinations: ['Tumpak Sewu'],
    arrival_time: '09:00'
  } as ItineraryScenario;
  const r = evaluateScenario(scenario, datasets);
  assert.ok(r.cost_components.includes('tumpak_sewu_local_guide'));
  assert.ok(
    !r.cost_components.includes('madakaripura_local_guide'),
    'a Tumpak-Sewu-only scenario must not emit a Madakaripura guide cost'
  );
});

test('derived route with undefined (reverse) legs is downgraded to manual review', async () => {
  const r = await evalSample('customer-scenario-bali-ijen-bromo-surabaya.json');
  assert.equal(r.status, 'needs_manual_review');
  assert.ok(
    r.better_route_notes.some((n) => n.toLowerCase().includes('undefined')),
    'expected a note about undefined transfer legs'
  );
});
