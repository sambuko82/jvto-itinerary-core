import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { INPUT_DIR } from '../config/paths.js';
import { extractBackoffice } from '../extract/extract-backoffice.js';
import { buildPickupContexts } from './build-pickup-contexts.js';
import { buildDropoffContexts } from './build-dropoff-contexts.js';
import { buildTimeWindowRules } from './build-time-window-rules.js';
import { buildAccommodationLogic } from './build-accommodation-logic.js';
import { buildCostComponents } from './build-cost-components.js';
import { buildRecommendationRules } from './build-recommendation-rules.js';
import { buildDestinationActivityProfiles } from './build-destination-activity-profiles.js';
import { buildOperationalEvents } from './build-operational-events.js';
import { buildMealLogic } from './build-meal-logic.js';
import { buildPackageRouteMap } from './build-package-route-map.js';

const FIXTURE = resolve(INPUT_DIR, 'new-backoffice/exports/itinerary-core-bundle.json');
const extract = await extractBackoffice(FIXTURE);

function hasBackofficeTrace(entity: { source_trace: { source: string }[] }): boolean {
  return entity.source_trace.some((t) => t.source === 'new_backoffice');
}

test('builders are unchanged (manual_seed) when no extract is passed', () => {
  const pickup = buildPickupContexts();
  const air = pickup.find((p) => p.id === 'surabaya_airport_pickup');
  assert.ok(air);
  assert.equal(air.confidence, 'manual_seed');
  assert.equal(air.backoffice_observed, undefined);
  assert.equal(hasBackofficeTrace(air), false);
});

test('pickup contexts enrich matched location groups', () => {
  const pickup = buildPickupContexts(extract);
  const air = pickup.find((p) => p.id === 'surabaya_airport_pickup');
  assert.ok(air);
  assert.equal(air.confidence, 'inferred');
  assert.ok(hasBackofficeTrace(air));
  assert.equal((air.backoffice_observed as { total_samples: number }).total_samples, 15);

  // unmatched context stays manual_seed
  const prev = pickup.find((p) => p.id === 'previous_tour_dropoff_pickup');
  assert.ok(prev);
  assert.equal(prev.confidence, 'manual_seed');
  assert.equal(hasBackofficeTrace(prev), false);
});

test('dropoff contexts enrich matched groups', () => {
  const dropoff = buildDropoffContexts(extract);
  const bali = dropoff.find((d) => d.id === 'bali_hotel_dropoff');
  assert.ok(bali);
  assert.ok(hasBackofficeTrace(bali));
  assert.equal((bali.backoffice_observed as { total_samples: number }).total_samples, 11);
});

test('time-window rules attach late-arrival evidence', () => {
  const rules = buildTimeWindowRules(extract);
  const ijen = rules.find((r) => r.id === 'late_arrival_before_ijen');
  assert.ok(ijen);
  assert.ok(hasBackofficeTrace(ijen));
  assert.ok((ijen.backoffice_observed as { late_arrival_samples: number }).late_arrival_samples > 0);
});

test('accommodation logic attaches hotel rate evidence via jvto-web crosswalk', () => {
  const logic = buildAccommodationLogic(extract);
  const ijenStaging = logic.find((l) => l.area_id === 'bondowoso_ijen_staging');
  assert.ok(ijenStaging);
  assert.ok(hasBackofficeTrace(ijenStaging));
  const observed = ijenStaging.backoffice_observed as {
    core_destination_id: string;
    jvto_web_slug: string;
    backoffice_id_provenance: string;
  };
  assert.equal(observed.core_destination_id, 'ijen');
  assert.equal(observed.jvto_web_slug, 'ijen-crater');
  // fixture now carries a destinations registry; slug join verifies the numeric id
  assert.equal(observed.backoffice_id_provenance, 'verified');
});

test('cost components fill default_rate_idr from a single clear backoffice rate', () => {
  const cost = buildCostComponents(extract);

  const jeep = cost.find((c) => c.id === 'bromo_jeep');
  assert.ok(jeep);
  assert.equal(jeep.default_rate_idr, 700000);
  assert.equal(jeep.confidence, 'inferred');
  assert.ok(hasBackofficeTrace(jeep));

  const driver = cost.find((c) => c.id === 'driver_cost');
  assert.ok(driver);
  assert.equal(driver.default_rate_idr, 250000);

  // vehicle day cost keeps null default (range only, no single rate)
  const vehicle = cost.find((c) => c.id === 'vehicle_private_car_day');
  assert.ok(vehicle);
  assert.equal(vehicle.default_rate_idr, null);
  assert.ok(hasBackofficeTrace(vehicle));

  const calibration = cost.find((c) => c.id === 'actual_expense_calibration');
  assert.ok(calibration);
  assert.ok(hasBackofficeTrace(calibration));
});

test('recommendation rules attach booking evidence', () => {
  const rules = buildRecommendationRules(extract);
  const ferry = rules.find((r) => r.id === 'ferry_bali_buffer_required');
  assert.ok(ferry);
  assert.ok(hasBackofficeTrace(ferry));
});

test('06 destination activity profiles attach activity cost evidence', () => {
  const profiles = buildDestinationActivityProfiles(extract);
  const bromo = profiles.find((p) => p.destination_id === 'bromo');
  assert.ok(bromo);
  assert.ok(hasBackofficeTrace(bromo));
  const obs = bromo.backoffice_observed as { activities: { code: string; list_price_idr: number }[] };
  assert.ok(obs.activities.some((a) => a.code === 'BROMO-JEEP' && a.list_price_idr === 700000));

  // ferry (other activity) attaches to the Bali/Ketapang connection profile
  const bali = profiles.find((p) => p.destination_id === 'bali_ketapang');
  assert.ok(bali?.backoffice_observed);
});

test('07 operational events attach activity/logistics evidence', () => {
  const events = buildOperationalEvents(extract);
  const jeep = events.find((e) => e.id === 'bromo_jeep_handoff');
  assert.ok(jeep);
  assert.ok(hasBackofficeTrace(jeep));
  assert.equal((jeep.backoffice_observed as { list_price_idr: number }).list_price_idr, 700000);

  const ferry = events.find((e) => e.id === 'ketapang_ferry_connection');
  assert.ok(ferry?.backoffice_observed);
});

test('08 meal logic attaches rate ranges + package inclusion counts', () => {
  const meals = buildMealLogic(extract);
  const dinner = meals.find((m) => m.id === 'dinner_before_ijen');
  assert.ok(dinner);
  assert.ok(hasBackofficeTrace(dinner));
  const obs = dinner.backoffice_observed as { dinner_rate_min_idr: number; packages_with_dinner: number };
  assert.ok(obs.dinner_rate_min_idr > 0);
  assert.ok(obs.packages_with_dinner >= 1);
});

test('11 package route map joins by slug to backoffice package template', () => {
  const items = buildPackageRouteMap(extract);
  const item = items.find((i) => i.package_id === 'bromo-ijen-3d2n');
  assert.ok(item);
  assert.ok(item.source_trace.some((t) => t.source === 'new_backoffice'));
  const obs = item.backoffice_observed as { backoffice_package_id: number; destination_core_ids: string[] };
  assert.equal(obs.backoffice_package_id, 47);
  assert.deepEqual(obs.destination_core_ids, ['bromo', 'ijen']);
});

test('enriched entities never expose a name key (PII guard)', () => {
  const all = [
    ...buildCostComponents(extract),
    ...buildDestinationActivityProfiles(extract),
    ...buildOperationalEvents(extract),
    ...buildMealLogic(extract),
    ...buildPackageRouteMap(extract)
  ];
  for (const e of all) {
    if (!e.backoffice_observed) continue;
    const json = JSON.stringify(e.backoffice_observed);
    assert.equal(/"name"\s*:/.test(json), false, `name key leaked`);
  }
});
