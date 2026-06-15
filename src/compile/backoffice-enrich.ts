import type { Confidence, SourceTrace } from '../domain/common.js';
import type { BackofficeExtract } from '../extract/sourceTypes.js';

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
  const patterns = extract.pickup_patterns.filter((p) => {
    if (opts.pickupGroups && !opts.pickupGroups.includes(p.location_group)) return false;
    if (opts.destination && !p.destinations.includes(opts.destination)) return false;
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
// Area -> backoffice destination_id mapping is best-effort and pending the
// jvto-web destination crosswalk; flagged in the observed payload.
// ---------------------------------------------------------------------------

const AREA_DESTINATION_IDS: Record<string, number[]> = {
  bromo_area_sunrise_staging: [2],
  bondowoso_ijen_staging: [5],
  banyuwangi_staging: [5]
};

export function accommodationObserved(extract: BackofficeExtract, areaId: string): Record<string, unknown> | null {
  const destIds = AREA_DESTINATION_IDS[areaId];
  if (!destIds) return null;
  const hotels = extract.hotel_meal_sources.filter(
    (h) => h.destination_id != null && destIds.includes(h.destination_id)
  );
  if (hotels.length === 0) return null;

  return {
    crosswalk: 'pending_jvto_web_destination_map',
    backoffice_destination_ids: destIds,
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
}

export function costEnrichment(extract: BackofficeExtract, id: string): CostEnrichment | null {
  switch (id) {
    case 'vehicle_private_car_day': {
      const v = extract.vehicle_cost_sources;
      const rates = v.map((x) => x.price_per_day).filter((r): r is number => r != null);
      if (rates.length === 0) return null;
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
      return {
        observed: {
          room_rate_min_idr: Math.min(...rates),
          room_rate_max_idr: Math.max(...rates),
          hotel_sample_count: extract.hotel_meal_sources.length
        }
      };
    }
    case 'restaurant_meal': {
      const lunch = extract.hotel_meal_sources.map((h) => h.lunch_rate).filter((r): r is number => r != null);
      const dinner = extract.hotel_meal_sources.map((h) => h.dinner_rate).filter((r): r is number => r != null);
      if (lunch.length === 0 && dinner.length === 0) return null;
      return {
        observed: {
          lunch_rate_min_idr: lunch.length ? Math.min(...lunch) : null,
          lunch_rate_max_idr: lunch.length ? Math.max(...lunch) : null,
          dinner_rate_min_idr: dinner.length ? Math.min(...dinner) : null,
          dinner_rate_max_idr: dinner.length ? Math.max(...dinner) : null
        }
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
