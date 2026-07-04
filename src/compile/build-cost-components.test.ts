import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { INPUT_DIR } from '../config/paths.js';
import { extractBackoffice } from '../extract/extract-backoffice.js';
import { buildCostComponents } from './build-cost-components.js';

const FIXTURE = resolve(INPUT_DIR, 'new-backoffice/exports/itinerary-core-bundle.json');
const extract = await extractBackoffice(FIXTURE);

test('every component with a filled default_rate_idr carries a non-empty source_trace', () => {
  for (const c of buildCostComponents(extract)) {
    if (c.default_rate_idr == null) continue;
    assert.ok(c.source_trace.length > 0, `${c.id} has a rate but no source_trace`);
  }
});

test('every component with a null default_rate_idr declares needed_source', () => {
  for (const c of buildCostComponents(extract)) {
    if (c.default_rate_idr != null) continue;
    assert.ok(
      typeof c.needed_source === 'string' && c.needed_source.length > 0,
      `${c.id} has null default_rate_idr but no needed_source`
    );
  }
});

test('no component declares needed_source while also carrying a filled rate', () => {
  for (const c of buildCostComponents(extract)) {
    if (c.default_rate_idr != null) {
      assert.ok(!c.needed_source, `${c.id} has both a rate and a needed_source`);
    }
  }
});

test('vehicle_private_car_day: entry-tier default, full tier table, no name leak', () => {
  const vehicle = buildCostComponents(extract).find((c) => c.id === 'vehicle_private_car_day');
  assert.ok(vehicle);
  assert.equal(vehicle.default_rate_idr, 650000);
  const table = vehicle.rate_table_idr as { by_vehicle_type: { vehicle_type_id: number; rate_jvto_per_day: number }[] };
  assert.equal(table.by_vehicle_type.length, 3);
  assert.equal(table.by_vehicle_type[0].rate_jvto_per_day, 650000);
  assert.equal(/"name"\s*:/.test(JSON.stringify(vehicle)), false);
});

test('hotel_room and restaurant_meal default to the observed median, not min or max', () => {
  const cost = buildCostComponents(extract);
  const hotelRoom = cost.find((c) => c.id === 'hotel_room');
  assert.ok(hotelRoom);
  const hotelObs = hotelRoom.backoffice_observed as { room_rate_min_idr: number; room_rate_max_idr: number; room_rate_median_idr: number };
  assert.equal(hotelRoom.default_rate_idr, hotelObs.room_rate_median_idr);
  assert.ok(hotelRoom.default_rate_idr! >= hotelObs.room_rate_min_idr);
  assert.ok(hotelRoom.default_rate_idr! <= hotelObs.room_rate_max_idr);

  const meal = cost.find((c) => c.id === 'restaurant_meal');
  assert.ok(meal);
  const mealObs = meal.backoffice_observed as { combined_rate_median_idr: number };
  assert.equal(meal.default_rate_idr, mealObs.combined_rate_median_idr);
});

test('seed-only (no backoffice extract) never fabricates a rate', () => {
  for (const c of buildCostComponents()) {
    assert.equal(c.backoffice_observed, undefined, `${c.id} should have no backoffice_observed without an extract`);
  }
});

test('deterministic: two builds produce byte-identical JSON', () => {
  const a = buildCostComponents(extract);
  const b = buildCostComponents(extract);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
