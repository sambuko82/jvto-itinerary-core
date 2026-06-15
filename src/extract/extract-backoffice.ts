import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { INPUT_DIR } from '../config/paths.js';
import { backofficeBundleSchema, type BackofficeBundle } from './backofficeBundle.js';
import {
  emptyBackofficeExtract,
  type BackofficeExtract,
  type PickupPattern,
  type PickupTimeBucket,
  type DropoffPattern,
  type HotelMealSource,
  type VehicleCostSource,
  type CrewCostSource,
  type ActivityCostSource,
  type ActivityActuals,
  type ActualCostPattern,
  type PackageRegistryEntry,
  type PackageItineraryDay
} from './sourceTypes.js';

/** Redacted bundle location, overridable for tests / alternate exports. */
const DEFAULT_BUNDLE_PATH = resolve(INPUT_DIR, 'new-backoffice/exports/itinerary-core-bundle.json');

const LOW_SAMPLE_THRESHOLD = 3;

/**
 * Extract structured operational data from the new-backoffice
 * `ExportDataItineraryCore::bundle()` JSON export.
 *
 * Returns an empty extract (with a data-quality note) when no export is present,
 * so the pipeline never hard-fails on a missing redacted bundle.
 */
export async function extractBackoffice(bundlePath: string = DEFAULT_BUNDLE_PATH): Promise<BackofficeExtract> {
  const envPath = process.env.BACKOFFICE_BUNDLE_PATH;
  const path = envPath ? resolve(envPath) : bundlePath;

  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    const extract = emptyBackofficeExtract();
    extract.data_quality_notes.push(
      `no backoffice export found at ${path}; extractor returned empty structured data (still requires redacted bundle ingestion)`
    );
    return extract;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const extract = emptyBackofficeExtract();
    extract.data_quality_notes.push(`backoffice export at ${path} is not valid JSON: ${(err as Error).message}`);
    return extract;
  }

  const result = backofficeBundleSchema.safeParse(parsed);
  if (!result.success) {
    const extract = emptyBackofficeExtract();
    extract.data_quality_notes.push(
      `backoffice export at ${path} failed schema validation: ${result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')}`
    );
    return extract;
  }

  return transformBundle(result.data, path);
}

function transformBundle(bundle: BackofficeBundle, path: string): BackofficeExtract {
  const extract: BackofficeExtract = {
    schema_version: bundle.schema_version,
    generated_at: bundle.generated_at ?? null,
    source: bundle.source ?? 'new-backoffice',
    pii_policy: bundle.pii_policy ?? null,
    destination_registry: bundle.destinations.map((d) => ({
      id: d.id,
      slug: d.slug ?? null,
      name: d.name ?? null
    })),
    package_registry: buildPackageRegistry(bundle),
    pickup_patterns: buildPickupPatterns(bundle),
    dropoff_patterns: buildDropoffPatterns(bundle),
    hotel_meal_sources: buildHotelMealSources(bundle),
    vehicle_cost_sources: buildVehicleCostSources(bundle),
    crew_cost_sources: buildCrewCostSources(bundle),
    destination_activity_cost_sources: buildActivityCostSources(bundle),
    actual_cost_patterns: buildActualCostPatterns(bundle),
    data_quality_notes: []
  };

  extract.data_quality_notes = buildDataQualityNotes(bundle, extract, path);
  return extract;
}

function buildPackageRegistry(bundle: BackofficeBundle): PackageRegistryEntry[] {
  // index child rows by package / itinerary-day for O(1) joins
  const detailsByDayId = new Map<number, { sort: number; time: string | null }[]>();
  for (const d of bundle.package_itinerary_day_details) {
    const list = detailsByDayId.get(d.itinerary_day_id) ?? [];
    list.push({ sort: d.sort_order ?? 0, time: d.time ?? null });
    detailsByDayId.set(d.itinerary_day_id, list);
  }

  const destIdsByPackage = new Map<number, number[]>();
  for (const pd of bundle.package_destinations) {
    const list = destIdsByPackage.get(pd.package_id) ?? [];
    if (!list.includes(pd.destination_id)) list.push(pd.destination_id);
    destIdsByPackage.set(pd.package_id, list);
  }

  const hotelIdsByPackage = new Map<number, number[]>();
  for (const ph of bundle.package_hotel_options) {
    if (ph.hotel_id == null) continue;
    const list = hotelIdsByPackage.get(ph.package_id) ?? [];
    if (!list.includes(ph.hotel_id)) list.push(ph.hotel_id);
    hotelIdsByPackage.set(ph.package_id, list);
  }

  const daysByPackage = new Map<number, PackageItineraryDay[]>();
  for (const day of bundle.package_itinerary_days) {
    const details = (detailsByDayId.get(day.id) ?? []).sort((a, b) => a.sort - b.sort);
    const list = daysByPackage.get(day.package_id) ?? [];
    list.push({
      day_no: day.day_no,
      hotel_id: day.hotel_id ?? null,
      meal_breakfast: day.meal_breakfast ?? null,
      meal_lunch: day.meal_lunch ?? null,
      meal_dinner: day.meal_dinner ?? null,
      detail_count: details.length,
      detail_times: details.map((d) => d.time).filter((t): t is string => t != null)
    });
    daysByPackage.set(day.package_id, list);
  }

  return bundle.packages.map((p) => {
    const days = (daysByPackage.get(p.id) ?? []).sort((a, b) => a.day_no - b.day_no);
    return {
      id: p.id,
      code: p.code ?? null,
      slug: p.slug ?? null,
      duration_id: p.duration_id ?? null,
      order_channel_id: p.order_channel_id ?? null,
      category_id: p.package_category_id ?? null,
      start_destination_id: p.start_destination_id ?? null,
      end_destination_id: p.end_destination_id ?? null,
      ideal_arrival: p.ideal_arrival ?? null,
      physicality: p.physicality ?? null,
      suitable_for: p.suitable_for ?? null,
      is_publish: p.is_publish ?? false,
      total_breakfast: p.total_breakfast ?? 0,
      total_lunch: p.total_lunch ?? 0,
      total_dinner: p.total_dinner ?? 0,
      destination_ids: (destIdsByPackage.get(p.id) ?? []).sort((a, b) => a - b),
      hotel_ids: (hotelIdsByPackage.get(p.id) ?? []).sort((a, b) => a - b),
      day_count: days.length,
      days
    };
  });
}

function buildPickupPatterns(bundle: BackofficeBundle): PickupPattern[] {
  const byGroup = new Map<string, PickupPattern>();

  for (const p of bundle.booking_logistics_patterns) {
    const group = p.pickup_location_group;
    let entry = byGroup.get(group);
    if (!entry) {
      entry = { location_group: group, total_samples: 0, time_buckets: [], destinations: [], package_ids: [] };
      byGroup.set(group, entry);
    }
    entry.total_samples += p.sample_count;
    entry.destinations = unionStrings(entry.destinations, p.destinations);
    entry.package_ids = unionNumbers(entry.package_ids, p.package_ids);

    let bucket = entry.time_buckets.find((b) => b.bucket === p.typical_pickup_time_bucket);
    if (!bucket) {
      bucket = { bucket: p.typical_pickup_time_bucket, sample_count: 0, risk_notes: [] } satisfies PickupTimeBucket;
      entry.time_buckets.push(bucket);
    }
    bucket.sample_count += p.sample_count;
    bucket.risk_notes = unionStrings(bucket.risk_notes, p.risk_notes);
  }

  const patterns = [...byGroup.values()];
  for (const entry of patterns) {
    entry.time_buckets.sort((a, b) => b.sample_count - a.sample_count || a.bucket.localeCompare(b.bucket));
  }
  patterns.sort((a, b) => b.total_samples - a.total_samples || a.location_group.localeCompare(b.location_group));
  return patterns;
}

function buildDropoffPatterns(bundle: BackofficeBundle): DropoffPattern[] {
  const byGroup = new Map<string, DropoffPattern>();

  for (const p of bundle.booking_logistics_patterns) {
    const group = p.dropoff_location_group;
    let entry = byGroup.get(group);
    if (!entry) {
      entry = { location_group: group, total_samples: 0, destinations: [], package_ids: [] };
      byGroup.set(group, entry);
    }
    entry.total_samples += p.sample_count;
    entry.destinations = unionStrings(entry.destinations, p.destinations);
    entry.package_ids = unionNumbers(entry.package_ids, p.package_ids);
  }

  const patterns = [...byGroup.values()];
  patterns.sort((a, b) => b.total_samples - a.total_samples || a.location_group.localeCompare(b.location_group));
  return patterns;
}

function buildHotelMealSources(bundle: BackofficeBundle): HotelMealSource[] {
  const configByRoomType = new Map<number, { pax: number | null; quantity: number | null }[]>();
  for (const cfg of bundle.room_configurations) {
    const list = configByRoomType.get(cfg.room_type_id) ?? [];
    list.push({ pax: cfg.pax ?? null, quantity: cfg.quantity ?? null });
    configByRoomType.set(cfg.room_type_id, list);
  }

  const roomsByHotel = new Map<number, HotelMealSource['room_types']>();
  for (const room of bundle.room_types) {
    const list = roomsByHotel.get(room.hotel_id) ?? [];
    list.push({
      room_type_id: room.id,
      room_name: room.room_name ?? null,
      bed_type: room.bed_type ?? null,
      rate_idr: room.rate_idr ?? null,
      rate_twt_idr: room.rate_twt_idr ?? null,
      configurations: configByRoomType.get(room.id) ?? []
    });
    roomsByHotel.set(room.hotel_id, list);
  }

  return bundle.hotels.map((h) => ({
    hotel_id: h.id,
    name: h.name ?? null,
    destination_id: h.destination_id ?? null,
    lunch_rate: h.lunch_rate ?? null,
    dinner_rate: h.dinner_rate ?? null,
    room_types: roomsByHotel.get(h.id) ?? []
  }));
}

function buildVehicleCostSources(bundle: BackofficeBundle): VehicleCostSource[] {
  return bundle.vehicle_types.map((v) => ({
    vehicle_type_id: v.id,
    name: v.name ?? null,
    capacity_min_pax: v.capacity_min_pax ?? null,
    capacity_max_pax: v.capacity_max_pax ?? null,
    price_per_day: v.price_per_day ?? null,
    price_twt_per_day: v.price_twt_per_day ?? null
  }));
}

function buildCrewCostSources(bundle: BackofficeBundle): CrewCostSource[] {
  const rulesByRole = new Map<number, CrewCostSource['assignment_rules']>();
  for (const rule of bundle.transport_crew_rules) {
    if (rule.crew_role_id == null) {
      continue;
    }
    const list = rulesByRole.get(rule.crew_role_id) ?? [];
    list.push({
      pax: rule.pax,
      vehicle_type_id: rule.vehicle_type_id ?? null,
      order_channel_id: rule.order_channel_id ?? null
    });
    rulesByRole.set(rule.crew_role_id, list);
  }

  return bundle.crew_roles.map((c) => ({
    crew_role_id: c.id,
    name: c.name ?? null,
    rate_per_day: c.rate_per_day ?? null,
    rate_twt_per_day: c.rate_twt_per_day ?? null,
    order_channel_id: c.order_channel_id ?? null,
    assignment_rules: (rulesByRole.get(c.id) ?? []).sort((a, b) => a.pax - b.pax)
  }));
}

function buildActivityCostSources(bundle: BackofficeBundle): ActivityCostSource[] {
  const destActuals = indexActuals(bundle.actual_cost_patterns.destination_activities);
  const otherActuals = indexActuals(bundle.actual_cost_patterns.other_activities);

  const destination = bundle.destination_activities.map<ActivityCostSource>((a) => ({
    activity_id: a.id,
    scope: 'destination',
    code: a.code ?? null,
    destination_id: a.destination_id ?? null,
    name: a.name ?? null,
    unit: a.unit ?? null,
    formula: a.formula ?? null,
    list_price: a.price ?? null,
    actuals: destActuals.get(a.id) ?? null
  }));

  const other = bundle.other_activities.map<ActivityCostSource>((a) => ({
    activity_id: a.id,
    scope: 'other',
    code: a.code ?? null,
    destination_id: null,
    name: a.name ?? null,
    unit: a.unit ?? null,
    formula: a.formula ?? null,
    list_price: a.price ?? null,
    actuals: otherActuals.get(a.id) ?? null
  }));

  return [...destination, ...other];
}

function indexActuals(
  patterns: BackofficeBundle['actual_cost_patterns']['destination_activities']
): Map<number, ActivityActuals> {
  const map = new Map<number, ActivityActuals>();
  for (const p of patterns) {
    if (p.activity_id == null) {
      continue;
    }
    map.set(p.activity_id, {
      sample_count: p.sample_count,
      avg_qty: p.avg_qty,
      avg_price: p.avg_price,
      avg_subtotal: p.avg_subtotal
    });
  }
  return map;
}

function buildActualCostPatterns(bundle: BackofficeBundle): ActualCostPattern[] {
  return bundle.booking_finance_patterns.map((f) => ({
    package_id: f.package_id,
    sample_count: f.sample_count,
    avg_total_expense: f.avg_total_expense,
    avg_total_expense_crew: f.avg_total_expense_crew,
    avg_profit: f.avg_profit
  }));
}

function buildDataQualityNotes(bundle: BackofficeBundle, extract: BackofficeExtract, path: string): string[] {
  const notes: string[] = [`ingested backoffice bundle ${bundle.schema_version} from ${path}`];

  if (bundle.pii_policy) {
    notes.push(`pii_policy: ${bundle.pii_policy}`);
  }

  notes.push(
    extract.destination_registry.length
      ? `destination registry: ${extract.destination_registry.length} records (slug join enables verified backoffice_destination_id)`
      : 'destination registry: none in export (backoffice_destination_id stays placeholder/unknown)'
  );

  notes.push(
    `coverage: ${extract.pickup_patterns.length} pickup / ${extract.dropoff_patterns.length} dropoff groups, ` +
      `${extract.hotel_meal_sources.length} hotels, ${extract.vehicle_cost_sources.length} vehicles, ` +
      `${extract.crew_cost_sources.length} crew roles, ${extract.destination_activity_cost_sources.length} activities, ` +
      `${extract.actual_cost_patterns.length} finance patterns, ${extract.package_registry.length} package templates`
  );

  const lowSamplePickup = extract.pickup_patterns
    .filter((p) => p.total_samples < LOW_SAMPLE_THRESHOLD)
    .map((p) => p.location_group);
  if (lowSamplePickup.length) {
    notes.push(`low-sample pickup groups (<${LOW_SAMPLE_THRESHOLD}): ${lowSamplePickup.join(', ')}`);
  }

  const activitiesMissingActuals = extract.destination_activity_cost_sources.filter((a) => a.actuals === null).length;
  if (activitiesMissingActuals) {
    notes.push(`${activitiesMissingActuals} activities have list price but no historical actual-cost samples`);
  }

  const emptySections = Object.entries({
    packages: bundle.packages.length,
    hotels: bundle.hotels.length,
    vehicle_types: bundle.vehicle_types.length,
    crew_roles: bundle.crew_roles.length,
    booking_logistics_patterns: bundle.booking_logistics_patterns.length
  })
    .filter(([, count]) => count === 0)
    .map(([name]) => name);
  if (emptySections.length) {
    notes.push(`empty bundle sections: ${emptySections.join(', ')}`);
  }

  notes.push(...bundle.warnings);
  return notes;
}

function unionStrings(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

function unionNumbers(a: number[], b: number[]): number[] {
  return [...new Set([...a, ...b])].sort((x, y) => x - y);
}
