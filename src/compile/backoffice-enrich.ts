import type { Confidence, SourceTrace } from '../domain/common.js';
import type { BackofficeExtract } from '../extract/sourceTypes.js';
import {
  crosswalkByCoreId,
  resolveBackofficeDestinationId,
  resolveDestinationToken
} from '../config/destination-crosswalk.js';

/**
 * Maps the new-backoffice structured extract onto generated datasets
 * (01 pickup, 02 dropoff, 03 time-window, 09 accommodation, 10 cost, 12 recommendation).
 *
 * Output carries only aggregated, PII-free evidence (sample counts, observed
 * rates, time buckets, ids). Entity `name` strings from the extract are used for
 * matching in code only — never written into generated JSON (PII validator blocks
 * the `name` key).
 */

const BUNDLE_REF = 'new-backoffice:ExportDataItineraryCore.bundle()';
const LATE_BUCKETS = ['afternoon', 'evening_night', 'overnight'];

export function backofficeTrace(field: string, confidence: Confidence = 'inferred'): SourceTrace {
  return { source: 'new_backoffice', ref: BUNDLE_REF, field, confidence };
}

/** Bump manual_seed -> inferred when backed by data; never downgrade verified. */
export function bumpConfidence(current: Confidence): Confidence {
  return current === 'manual_seed' ? 'inferred' : current;
}

// ---------------------------------------------------------------------------
// 01 pickup contexts
// ---------------------------------------------------------------------------

const PICKUP_GROUPS_BY_ID: Record<string, string[]> = {
  surabaya_airport_pickup: ['Surabaya Airport', 'Airport'],
  surabaya_hotel_pickup: ['Hotel'],
  surabaya_train_station_pickup: ['Train Station'],
  ketapang_harbor_pickup: ['Ketapang Harbor'],
  surabaya_city_point_pickup: ['Surabaya']
};

export function pickupObserved(extract: BackofficeExtract, id: string): Record<string, unknown> | null {
  const groups = PICKUP_GROUPS_BY_ID[id];
  if (!groups) return null;
  const matched = extract.pickup_patterns.filter((p) => groups.includes(p.location_group));
  if (matched.length === 0) return null;

  const time_buckets = mergeBuckets(matched.flatMap((p) => p.time_buckets));
  return {
    matched_groups: matched.map((p) => p.location_group),
    total_samples: matched.reduce((sum, p) => sum + p.total_samples, 0),
    time_buckets,
    destinations: uniqueStrings(matched.flatMap((p) => p.destinations)),
    package_ids: uniqueNumbers(matched.flatMap((p) => p.package_ids))
  };
}

// ---------------------------------------------------------------------------
// 02 dropoff contexts
// ---------------------------------------------------------------------------

const DROPOFF_GROUPS_BY_ID: Record<string, string[]> = {
  ketapang_harbor_dropoff: ['Ketapang Harbor'],
  surabaya_airport_dropoff: ['Surabaya Airport', 'Airport'],
  bali_hotel_dropoff: ['Bali'],
  surabaya_hotel_dropoff: ['Surabaya', 'Hotel'],
  surabaya_train_station_dropoff: ['Train Station'],
  malang_dropoff: ['Malang']
};

export function dropoffObserved(extract: BackofficeExtract, id: string): Record<string, unknown> | null {
  const groups = DROPOFF_GROUPS_BY_ID[id];
  if (!groups) return null;
  const matched = extract.dropoff_patterns.filter((p) => groups.includes(p.location_group));
  if (matched.length === 0) return null;

  return {
    matched_groups: matched.map((p) => p.location_group),
    total_samples: matched.reduce((sum, p) => sum + p.total_samples, 0),
    destinations: uniqueStrings(matched.flatMap((p) => p.destinations)),
    package_ids: uniqueNumbers(matched.flatMap((p) => p.package_ids))
  };
}

// ---------------------------------------------------------------------------
// 03 time-window rules — late-arrival logistics evidence
// ---------------------------------------------------------------------------

export function lateArrivalEvidence(
  extract: BackofficeExtract,
  opts: { destination?: string; pickupGroups?: string[] }
): Record<string, unknown> | null {
  const wantCoreId = opts.destination ? resolveDestinationToken(opts.destination) : null;
  const patterns = extract.pickup_patterns.filter((p) => {
    if (opts.pickupGroups && !opts.pickupGroups.includes(p.location_group)) return false;
    if (opts.destination) {
      const matched = p.destinations.some((d) =>
        wantCoreId ? resolveDestinationToken(d) === wantCoreId : d === opts.destination
      );
      if (!matched) return false;
    }
    return true;
  });
  if (patterns.length === 0) return null;

  const byBucket: Record<string, number> = {};
  let lateSamples = 0;
  for (const p of patterns) {
    for (const b of p.time_buckets) {
      if (!LATE_BUCKETS.includes(b.bucket)) continue;
      byBucket[b.bucket] = (byBucket[b.bucket] ?? 0) + b.sample_count;
      lateSamples += b.sample_count;
    }
  }
  if (lateSamples === 0) return null;

  return {
    late_arrival_samples: lateSamples,
    by_bucket: byBucket,
    matched_pickup_groups: patterns.map((p) => p.location_group),
    destination_filter: opts.destination ?? null
  };
}

// ---------------------------------------------------------------------------
// 09 accommodation logic — hotel meal/room rate availability by area
//
// Area -> core destination id is jvto-web-verified (DESTINATION_CROSSWALK).
// core id -> numeric backoffice destination_id is still a placeholder pending a
// real backoffice destinations export; provenance is surfaced in the payload.
// ---------------------------------------------------------------------------

const AREA_TO_CORE_DESTINATION: Record<string, string> = {
  bromo_area_sunrise_staging: 'bromo',
  bondowoso_ijen_staging: 'ijen',
  banyuwangi_staging: 'ijen',
  tumpak_sewu_staging: 'tumpak_sewu',
  papuma_staging: 'papuma',
  malang_batu_staging: 'malang_batu'
};

export function accommodationObserved(extract: BackofficeExtract, areaId: string): Record<string, unknown> | null {
  const coreId = AREA_TO_CORE_DESTINATION[areaId];
  if (!coreId) return null;
  const entry = crosswalkByCoreId(coreId);
  // Prefer the export's destination registry (slug join => verified id);
  // fall back to the static placeholder when the export has no registry.
  const resolved = resolveBackofficeDestinationId(coreId, extract.destination_registry);
  if (resolved.backofficeDestinationId == null) return null;

  const hotels = extract.hotel_meal_sources.filter((h) => h.destination_id === resolved.backofficeDestinationId);
  if (hotels.length === 0) return null;

  return {
    core_destination_id: coreId,
    jvto_web_slug: entry?.slug ?? null,
    backoffice_destination_id: resolved.backofficeDestinationId,
    backoffice_id_provenance: resolved.provenance,
    hotels: hotels.map((h) => {
      const roomRates = h.room_types.map((r) => r.rate_idr).filter((r): r is number => r != null);
      return {
        hotel_id: h.hotel_id,
        lunch_rate: h.lunch_rate,
        dinner_rate: h.dinner_rate,
        room_type_count: h.room_types.length,
        room_rate_min_idr: roomRates.length ? Math.min(...roomRates) : null,
        room_rate_max_idr: roomRates.length ? Math.max(...roomRates) : null
      };
    })
  };
}

// ---------------------------------------------------------------------------
// 10 cost components — observed rates + optional default rate fill
// ---------------------------------------------------------------------------

export interface CostEnrichment {
  observed: Record<string, unknown>;
  /** Fill default_rate_idr only when currently null and a single clear rate exists. */
  defaultRateIdr?: number;
  /** Fill rate_table_idr only when the component doesn't already carry a static one. */
  rateTableIdr?: Record<string, unknown>;
}

/** Median of a numeric array (average of the two middle values when even-length). Caller must pass a non-empty array. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function costEnrichment(extract: BackofficeExtract, id: string): CostEnrichment | null {
  switch (id) {
    case 'vehicle_private_car_day': {
      const v = extract.vehicle_cost_sources;
      const rates = v.map((x) => x.price_per_day).filter((r): r is number => r != null);
      if (rates.length === 0) return null;
      // Multiple vehicle-type tiers exist (capacity-based), so a flat default
      // is inherently a simplification. Pick the JVTO rate of the
      // smallest-capacity tier as the entry-level default, and expose every
      // tier x channel in rate_table_idr so callers needing a specific
      // capacity/channel never have to fall back to the flat default.
      const withRate = v.filter((x): x is typeof x & { price_per_day: number } => x.price_per_day != null);
      const entryTier = withRate.reduce((min, x) =>
        (x.capacity_min_pax ?? Infinity) < (min.capacity_min_pax ?? Infinity) ? x : min
      );
      return {
        observed: {
          rate_per_day_min_idr: Math.min(...rates),
          rate_per_day_max_idr: Math.max(...rates),
          sources: v.map((x) => ({
            vehicle_type_id: x.vehicle_type_id,
            capacity_min_pax: x.capacity_min_pax,
            capacity_max_pax: x.capacity_max_pax,
            price_per_day: x.price_per_day,
            price_twt_per_day: x.price_twt_per_day
          }))
        },
        defaultRateIdr: entryTier.price_per_day,
        rateTableIdr: {
          note: 'Default is the JVTO-channel rate for the smallest-capacity vehicle tier. Actual rate depends on the vehicle assigned for the group size — use by_vehicle_type for the specific tier/channel.',
          by_vehicle_type: v.map((x) => ({
            vehicle_type_id: x.vehicle_type_id,
            capacity_min_pax: x.capacity_min_pax,
            capacity_max_pax: x.capacity_max_pax,
            rate_jvto_per_day: x.price_per_day,
            rate_twt_per_day: x.price_twt_per_day
          }))
        }
      };
    }
    case 'driver_cost':
      return crewRateEnrichment(extract, 'Driver');
    case 'escort_cost':
      return crewRateEnrichment(extract, 'Driver Guide');
    case 'bromo_jeep':
      return activityEnrichment(extract, 'BROMO-JEEP', { fillDefault: true });
    case 'ijen_local_guide':
      return activityEnrichment(extract, 'IJEN-GUIDE', { fillDefault: true });
    case 'ferry_ticket':
      return activityEnrichment(extract, 'KETAPANG-FERRY', { fillDefault: false });
    case 'hotel_room': {
      const rates = extract.hotel_meal_sources
        .flatMap((h) => h.room_types.map((r) => r.rate_idr))
        .filter((r): r is number => r != null);
      if (rates.length === 0) return null;
      // Room rates are inherently per-hotel; the median across observed room
      // types is used as a representative default (see rate_note on the
      // component: "actual = hotel-specific rate; default = median").
      return {
        observed: {
          room_rate_min_idr: Math.min(...rates),
          room_rate_max_idr: Math.max(...rates),
          room_rate_median_idr: median(rates),
          room_type_sample_count: rates.length,
          hotel_sample_count: extract.hotel_meal_sources.length
        },
        defaultRateIdr: median(rates)
      };
    }
    case 'restaurant_meal': {
      const lunch = extract.hotel_meal_sources.map((h) => h.lunch_rate).filter((r): r is number => r != null);
      const dinner = extract.hotel_meal_sources.map((h) => h.dinner_rate).filter((r): r is number => r != null);
      if (lunch.length === 0 && dinner.length === 0) return null;
      // Combine both meal types into one distribution: the component's
      // formula is generic ("meal_rate * pax") and applies to whichever meal
      // is arranged outside the hotel, not lunch or dinner specifically.
      const combined = [...lunch, ...dinner];
      return {
        observed: {
          lunch_rate_min_idr: lunch.length ? Math.min(...lunch) : null,
          lunch_rate_max_idr: lunch.length ? Math.max(...lunch) : null,
          dinner_rate_min_idr: dinner.length ? Math.min(...dinner) : null,
          dinner_rate_max_idr: dinner.length ? Math.max(...dinner) : null,
          combined_rate_median_idr: combined.length ? median(combined) : null,
          combined_sample_count: combined.length
        },
        ...(combined.length ? { defaultRateIdr: median(combined) } : {})
      };
    }
    case 'actual_expense_calibration': {
      if (extract.actual_cost_patterns.length === 0) return null;
      return {
        observed: {
          package_finance: extract.actual_cost_patterns.map((f) => ({
            package_id: f.package_id,
            sample_count: f.sample_count,
            avg_total_expense_idr: f.avg_total_expense,
            avg_total_expense_crew_idr: f.avg_total_expense_crew,
            avg_profit_idr: f.avg_profit
          }))
        }
      };
    }
    default:
      return null;
  }
}

function crewRateEnrichment(extract: BackofficeExtract, roleName: string): CostEnrichment | null {
  const role = extract.crew_cost_sources.find((c) => c.name === roleName);
  if (!role || role.rate_per_day == null) return null;
  return {
    defaultRateIdr: role.rate_per_day,
    observed: {
      crew_role_id: role.crew_role_id,
      rate_per_day_idr: role.rate_per_day,
      rate_twt_per_day_idr: role.rate_twt_per_day,
      order_channel_id: role.order_channel_id,
      assignment_rule_count: role.assignment_rules.length
    }
  };
}

function activityEnrichment(
  extract: BackofficeExtract,
  code: string,
  opts: { fillDefault: boolean }
): CostEnrichment | null {
  const activity = extract.destination_activity_cost_sources.find((a) => a.code === code);
  if (!activity) return null;
  const observed: Record<string, unknown> = {
    activity_id: activity.activity_id,
    scope: activity.scope,
    unit: activity.unit,
    list_price_idr: activity.list_price,
    actuals: activity.actuals
  };
  const enrichment: CostEnrichment = { observed };
  if (opts.fillDefault && activity.list_price != null) {
    enrichment.defaultRateIdr = activity.list_price;
  }
  return enrichment;
}

// ---------------------------------------------------------------------------
// 12 recommendation rules
// ---------------------------------------------------------------------------

export function recommendationObserved(extract: BackofficeExtract, id: string): Record<string, unknown> | null {
  switch (id) {
    case 'late_airport_arrival_requires_rest_warning':
      return lateArrivalEvidence(extract, { pickupGroups: ['Surabaya Airport', 'Airport'] });
    case 'ferry_bali_buffer_required': {
      const ferry = extract.destination_activity_cost_sources.find((a) => a.code === 'KETAPANG-FERRY');
      const dropoffs = extract.dropoff_patterns.filter((p) => ['Bali', 'Ketapang Harbor'].includes(p.location_group));
      if (!ferry && dropoffs.length === 0) return null;
      return {
        ferry_actuals: ferry?.actuals ?? null,
        ferry_list_price_idr: ferry?.list_price ?? null,
        bali_ketapang_dropoff_samples: dropoffs.reduce((sum, p) => sum + p.total_samples, 0),
        dropoff_groups: dropoffs.map((p) => p.location_group)
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 06 destination activity profiles
// ---------------------------------------------------------------------------

/** Resolve a numeric backoffice destination_id to a core id via the registry + crosswalk. */
function numericDestinationToCore(extract: BackofficeExtract, numericId: number | null): string | null {
  if (numericId == null) return null;
  const reg = extract.destination_registry.find((d) => d.id === numericId);
  if (reg?.slug) {
    const core = resolveDestinationToken(reg.slug);
    if (core) return core;
  }
  return null;
}

export function activityProfileObserved(extract: BackofficeExtract, coreDestId: string): Record<string, unknown> | null {
  const activities = extract.destination_activity_cost_sources.filter((a) => {
    if (a.scope === 'destination') return numericDestinationToCore(extract, a.destination_id) === coreDestId;
    // 'other' activities are destination-less; attach the ferry to the Bali/Ketapang connection profile.
    if (a.scope === 'other' && coreDestId === 'bali_ketapang') return /ferry|ketapang|gilimanuk/i.test(a.code ?? '');
    return false;
  });
  if (activities.length === 0) return null;

  return {
    activity_count: activities.length,
    activities: activities.map((a) => ({
      activity_id: a.activity_id,
      code: a.code,
      scope: a.scope,
      unit: a.unit,
      formula: a.formula,
      list_price_idr: a.list_price,
      actuals: a.actuals
    }))
  };
}

// ---------------------------------------------------------------------------
// 07 operational events
// ---------------------------------------------------------------------------

function findActivityByCode(extract: BackofficeExtract, code: string) {
  return extract.destination_activity_cost_sources.find((a) => a.code === code) ?? null;
}

function hotelsForCore(extract: BackofficeExtract, coreId: string) {
  const id = resolveBackofficeDestinationId(coreId, extract.destination_registry).backofficeDestinationId;
  if (id == null) return [];
  return extract.hotel_meal_sources.filter((h) => h.destination_id === id);
}

export function operationalEventObserved(extract: BackofficeExtract, id: string): Record<string, unknown> | null {
  switch (id) {
    case 'bromo_jeep_handoff': {
      const jeep = findActivityByCode(extract, 'BROMO-JEEP');
      if (!jeep) return null;
      return { activity_id: jeep.activity_id, unit: jeep.unit, list_price_idr: jeep.list_price, actuals: jeep.actuals };
    }
    case 'ketapang_ferry_connection': {
      const ferry = findActivityByCode(extract, 'KETAPANG-FERRY');
      const dropoffs = extract.dropoff_patterns.filter((p) => ['Bali', 'Ketapang Harbor'].includes(p.location_group));
      if (!ferry && dropoffs.length === 0) return null;
      return {
        ferry_activity_id: ferry?.activity_id ?? null,
        ferry_unit: ferry?.unit ?? null,
        ferry_list_price_idr: ferry?.list_price ?? null,
        ferry_actuals: ferry?.actuals ?? null,
        bali_ketapang_dropoff_samples: dropoffs.reduce((sum, p) => sum + p.total_samples, 0)
      };
    }
    case 'bondowoso_dinner_medical_check': {
      const hotels = hotelsForCore(extract, 'ijen');
      const lateIjen = lateArrivalEvidence(extract, { destination: 'ijen' });
      if (hotels.length === 0 && !lateIjen) return null;
      const dinner = hotels.map((h) => h.dinner_rate).filter((r): r is number => r != null);
      return {
        ijen_area_hotels: hotels.length,
        dinner_rate_min_idr: dinner.length ? Math.min(...dinner) : null,
        dinner_rate_max_idr: dinner.length ? Math.max(...dinner) : null,
        late_arrival_samples: lateIjen ? (lateIjen as { late_arrival_samples: number }).late_arrival_samples : 0
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 08 meal logic
// ---------------------------------------------------------------------------

function mealRateRange(extract: BackofficeExtract, meal: 'lunch' | 'dinner'): { min: number; max: number } | null {
  const rates = extract.hotel_meal_sources
    .map((h) => (meal === 'lunch' ? h.lunch_rate : h.dinner_rate))
    .filter((r): r is number => r != null);
  if (rates.length === 0) return null;
  return { min: Math.min(...rates), max: Math.max(...rates) };
}

export function mealLogicObserved(extract: BackofficeExtract, id: string): Record<string, unknown> | null {
  switch (id) {
    case 'dinner_before_ijen': {
      const range = mealRateRange(extract, 'dinner');
      const packagesWithDinner = extract.package_registry.filter((p) => p.total_dinner > 0).length;
      if (!range && packagesWithDinner === 0) return null;
      return {
        dinner_rate_min_idr: range?.min ?? null,
        dinner_rate_max_idr: range?.max ?? null,
        packages_with_dinner: packagesWithDinner
      };
    }
    case 'takeaway_breakfast_after_ijen_or_bromo': {
      const packagesWithBreakfast = extract.package_registry.filter((p) => p.total_breakfast > 0).length;
      const earlyDays = extract.package_registry
        .flatMap((p) => p.days)
        .filter((d) => d.meal_breakfast === true && d.detail_times.some((t) => t < '06:00')).length;
      if (packagesWithBreakfast === 0 && earlyDays === 0) return null;
      return { packages_with_breakfast: packagesWithBreakfast, early_departure_breakfast_days: earlyDays };
    }
    case 'lunch_stop_own_expense_long_transfer': {
      const range = mealRateRange(extract, 'lunch');
      const packagesWithLunch = extract.package_registry.filter((p) => p.total_lunch > 0).length;
      if (!range && packagesWithLunch === 0) return null;
      return {
        lunch_rate_min_idr: range?.min ?? null,
        lunch_rate_max_idr: range?.max ?? null,
        packages_with_lunch: packagesWithLunch
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 11 package route map
// ---------------------------------------------------------------------------

export function packageRouteObserved(extract: BackofficeExtract, packageId: string): Record<string, unknown> | null {
  const entry = extract.package_registry.find((p) => p.slug === packageId || p.code === packageId);
  if (!entry) return null;
  return {
    backoffice_package_id: entry.id,
    code: entry.code,
    duration_id: entry.duration_id,
    order_channel_id: entry.order_channel_id,
    day_count: entry.day_count,
    hotel_count: entry.hotel_ids.length,
    start_core_destination: numericDestinationToCore(extract, entry.start_destination_id),
    end_core_destination: numericDestinationToCore(extract, entry.end_destination_id),
    destination_core_ids: entry.destination_ids
      .map((id) => numericDestinationToCore(extract, id))
      .filter((c): c is string => c != null),
    meal_totals: { breakfast: entry.total_breakfast, lunch: entry.total_lunch, dinner: entry.total_dinner }
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mergeBuckets(
  buckets: { bucket: string; sample_count: number; risk_notes: string[] }[]
): { bucket: string; sample_count: number; risk_notes: string[] }[] {
  const byBucket = new Map<string, { bucket: string; sample_count: number; risk_notes: string[] }>();
  for (const b of buckets) {
    const existing = byBucket.get(b.bucket);
    if (existing) {
      existing.sample_count += b.sample_count;
      existing.risk_notes = uniqueStrings([...existing.risk_notes, ...b.risk_notes]);
    } else {
      byBucket.set(b.bucket, { bucket: b.bucket, sample_count: b.sample_count, risk_notes: [...b.risk_notes] });
    }
  }
  return [...byBucket.values()].sort((a, b) => b.sample_count - a.sample_count || a.bucket.localeCompare(b.bucket));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
