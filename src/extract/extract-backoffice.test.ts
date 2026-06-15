import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { INPUT_DIR } from '../config/paths.js';
import { extractBackoffice } from './extract-backoffice.js';

const FIXTURE = resolve(INPUT_DIR, 'new-backoffice/exports/itinerary-core-bundle.json');

test('extractBackoffice parses the redacted bundle fixture', async () => {
  const extract = await extractBackoffice(FIXTURE);

  assert.equal(extract.schema_version, 'backoffice-itinerary-core/v1');
  assert.equal(extract.source, 'new-backoffice');
  assert.equal(extract.pii_policy, 'redacted_no_raw_customer_contact');
});

test('destination registry is extracted with id + slug for crosswalk join', async () => {
  const extract = await extractBackoffice(FIXTURE);

  assert.ok(extract.destination_registry.length >= 2);
  const ijen = extract.destination_registry.find((d) => d.slug === 'ijen-crater');
  assert.ok(ijen);
  assert.equal(ijen.id, 5);
});

test('pickup patterns aggregate logistics by location group with buckets', async () => {
  const extract = await extractBackoffice(FIXTURE);

  const surabayaAirport = extract.pickup_patterns.find((p) => p.location_group === 'Surabaya Airport');
  assert.ok(surabayaAirport, 'expected Surabaya Airport pickup group');
  // two logistics rows for this pickup: 9 + 6 samples
  assert.equal(surabayaAirport.total_samples, 15);
  assert.equal(surabayaAirport.time_buckets.length, 2);
  // most-sampled bucket first
  assert.equal(surabayaAirport.time_buckets[0].bucket, 'evening_night');
  assert.deepEqual(surabayaAirport.package_ids, [47, 48]);

  // patterns sorted by total_samples desc
  assert.equal(extract.pickup_patterns[0].location_group, 'Surabaya Airport');
});

test('dropoff patterns aggregate by dropoff group', async () => {
  const extract = await extractBackoffice(FIXTURE);

  const bali = extract.dropoff_patterns.find((p) => p.location_group === 'Bali');
  assert.ok(bali);
  assert.equal(bali.total_samples, 11); // 9 + 2
});

test('hotel meal sources join room types and configurations', async () => {
  const extract = await extractBackoffice(FIXTURE);

  const hotel = extract.hotel_meal_sources.find((h) => h.hotel_id === 1);
  assert.ok(hotel);
  assert.equal(hotel.lunch_rate, 60000);
  assert.equal(hotel.dinner_rate, 85000);
  assert.equal(hotel.room_types.length, 2);
  const deluxe = hotel.room_types.find((r) => r.room_type_id === 11);
  assert.ok(deluxe);
  assert.equal(deluxe.rate_idr, 650000);
  assert.equal(deluxe.configurations.length, 1);
  assert.equal(deluxe.configurations[0].pax, 2);
});

test('vehicle and crew cost sources map rates and assignment rules', async () => {
  const extract = await extractBackoffice(FIXTURE);

  const hiace = extract.vehicle_cost_sources.find((v) => v.name === 'Hiace');
  assert.ok(hiace);
  assert.equal(hiace.price_per_day, 1250000);

  const driverGuide = extract.crew_cost_sources.find((c) => c.crew_role_id === 1);
  assert.ok(driverGuide);
  assert.equal(driverGuide.rate_per_day, 350000);
  assert.equal(driverGuide.assignment_rules.length, 2);
  // assignment rules sorted by pax
  assert.equal(driverGuide.assignment_rules[0].pax, 1);
});

test('activity cost sources join list price with historical actuals', async () => {
  const extract = await extractBackoffice(FIXTURE);

  const jeep = extract.destination_activity_cost_sources.find((a) => a.code === 'BROMO-JEEP');
  assert.ok(jeep);
  assert.equal(jeep.scope, 'destination');
  assert.equal(jeep.list_price, 700000);
  assert.ok(jeep.actuals);
  assert.equal(jeep.actuals.sample_count, 14);

  const guide = extract.destination_activity_cost_sources.find((a) => a.code === 'IJEN-GUIDE');
  assert.ok(guide);
  assert.equal(guide.actuals, null); // no actual-cost samples for this one

  const ferry = extract.destination_activity_cost_sources.find((a) => a.code === 'KETAPANG-FERRY');
  assert.ok(ferry);
  assert.equal(ferry.scope, 'other');
});

test('actual cost patterns expose per-package finance aggregates', async () => {
  const extract = await extractBackoffice(FIXTURE);

  const pkg48 = extract.actual_cost_patterns.find((p) => p.package_id === 48);
  assert.ok(pkg48);
  assert.equal(pkg48.avg_total_expense, 2650000);
  assert.equal(pkg48.avg_profit, 910000);
});

test('data quality notes flag low-sample groups and missing actuals', async () => {
  const extract = await extractBackoffice(FIXTURE);

  assert.ok(extract.data_quality_notes.some((n) => n.includes('coverage:')));
  assert.ok(extract.data_quality_notes.some((n) => n.includes('low-sample pickup groups')));
  assert.ok(extract.data_quality_notes.some((n) => n.includes('no historical actual-cost samples')));
});

test('missing export returns empty extract with a note, no throw', async () => {
  const extract = await extractBackoffice(resolve(INPUT_DIR, 'new-backoffice/exports/does-not-exist.json'));

  assert.equal(extract.pickup_patterns.length, 0);
  assert.equal(extract.hotel_meal_sources.length, 0);
  assert.ok(extract.data_quality_notes.some((n) => n.includes('no backoffice export found')));
});
