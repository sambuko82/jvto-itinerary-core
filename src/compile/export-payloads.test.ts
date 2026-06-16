import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';

const PAYLOADS = [
  `${EXPORT_DIR}/page-payload/sample-itinerary-page.json`,
  `${EXPORT_DIR}/pdf-payload/sample-itinerary-pdf.json`,
  `${EXPORT_DIR}/whatsapp-payload/sample-whatsapp-summary.json`,
  `${EXPORT_DIR}/internal-ops-payload/sample-internal-ops.json`,
  `${EXPORT_DIR}/ai-context-pack/sample-ai-context.json`
];

interface PackageContext {
  package_route_id: string | null;
  status: string;
  recommended_route_sequence: string[];
  cost_components: string[];
  package_structure: {
    backoffice_package_id: number;
    day_count: number;
    hotel_count: number;
    destination_core_ids: string[];
    meal_totals: { breakfast: number; lunch: number; dinner: number };
  } | null;
}

test('every export payload carries the package-aware scenario context', async () => {
  for (const file of PAYLOADS) {
    const payload = await readJson<{ package_context?: PackageContext }>(file);
    const ctx = payload.package_context;
    assert.ok(ctx, `package_context missing in ${file}`);
    assert.equal(ctx.package_route_id, 'bromo-ijen-bali-4d3n', `wrong package in ${file}`);
    assert.equal(ctx.status, 'recommended');
  }
});

test('threaded package_structure is complete (day/hotel/destination)', async () => {
  const payload = await readJson<{ package_context: PackageContext }>(PAYLOADS[3]);
  const structure = payload.package_context.package_structure;
  assert.ok(structure, 'package_structure should be present');
  assert.equal(structure.backoffice_package_id, 48);
  assert.ok(structure.day_count > 0, 'day_count should be > 0');
  assert.ok(structure.hotel_count > 0, 'hotel_count should be > 0');
  assert.ok(structure.destination_core_ids.includes('bromo'));
  assert.ok(structure.destination_core_ids.includes('ijen'));
  assert.ok(structure.destination_core_ids.includes('bali_ketapang'));
  assert.ok(structure.meal_totals, 'meal_totals should remain available');
});

test('package route_summary in the website page payload reflects the package route', async () => {
  const payload = await readJson<{ page_model: { package_baseline: { route_summary: string[]; day_count: number } } }>(
    PAYLOADS[0]
  );
  const baseline = payload.page_model.package_baseline;
  assert.deepEqual(baseline.route_summary, [
    'Surabaya',
    'Bromo Area',
    'Bondowoso / Ijen Area',
    'Ijen Crater',
    'Ketapang Harbor',
    'Bali'
  ]);
  assert.ok(baseline.day_count > 0);
});

test('threaded cost_components stay canonical IDs with no rate fields (no quote leak)', async () => {
  const payload = await readJson<{ package_context: PackageContext }>(PAYLOADS[4]);
  for (const id of payload.package_context.cost_components) {
    assert.equal(typeof id, 'string', 'cost_components must be plain string IDs');
  }
  // The package context must not carry any numeric rate/total fields.
  const json = JSON.stringify(payload.package_context);
  assert.equal(/"rate_idr"|"total_idr"|"price"/.test(json), false, 'no rate/price fields allowed in package_context');
});
