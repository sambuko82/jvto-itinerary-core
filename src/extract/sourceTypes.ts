export interface ExtractedSourceData {
  packages: unknown[];
  routes: unknown[];
  destinations: unknown[];
  logistics: unknown[];
  costs: unknown[];
  notes: string[];
}

export const emptyExtractedSourceData = (): ExtractedSourceData => ({
  packages: [],
  routes: [],
  destinations: [],
  logistics: [],
  costs: [],
  notes: []
});

/**
 * Structured new-backoffice extract.
 *
 * Normalized from the `backoffice-itinerary-core/v1` bundle into the operational
 * sections this core enriches: pickup/dropoff reality, hotel+meal rates, vehicle
 * and crew costs, activity costs, and historical actual-cost calibration.
 *
 * This is the Phase 1 extractor output. Builder wiring (mapping these sections
 * onto generated datasets 01/02/03/09/10/12) is a later phase.
 */
export interface BackofficeExtract {
  schema_version: string;
  generated_at: string | null;
  source: string;
  pii_policy: string | null;
  destination_registry: DestinationRegistryEntry[];
  package_registry: PackageRegistryEntry[];
  pickup_patterns: PickupPattern[];
  dropoff_patterns: DropoffPattern[];
  hotel_meal_sources: HotelMealSource[];
  vehicle_cost_sources: VehicleCostSource[];
  crew_cost_sources: CrewCostSource[];
  destination_activity_cost_sources: ActivityCostSource[];
  actual_cost_patterns: ActualCostPattern[];
  data_quality_notes: string[];
}

/**
 * PII-free destination reference from the bundle `destinations` section.
 * `slug` is the stable cross-system join key to the jvto-web destination crosswalk.
 */
export interface DestinationRegistryEntry {
  id: number;
  slug: string | null;
  name: string | null;
}

/** PII-free package itinerary day (no free-text title/activity copy). */
export interface PackageItineraryDay {
  day_no: number;
  hotel_id: number | null;
  meal_breakfast: boolean | null;
  meal_lunch: boolean | null;
  meal_dinner: boolean | null;
  detail_count: number;
  detail_times: string[];
}

/**
 * PII-free package template (reference structure for route maps / meal logic).
 * Carries code/slug/ids only — never the package `name` (PII-key blocked).
 */
export interface PackageRegistryEntry {
  id: number;
  code: string | null;
  slug: string | null;
  duration_id: number | null;
  order_channel_id: number | null;
  category_id: number | null;
  start_destination_id: number | null;
  end_destination_id: number | null;
  ideal_arrival: string | null;
  physicality: string | null;
  suitable_for: string | null;
  is_publish: boolean;
  total_breakfast: number;
  total_lunch: number;
  total_dinner: number;
  destination_ids: number[];
  hotel_ids: number[];
  day_count: number;
  days: PackageItineraryDay[];
}

export interface PickupTimeBucket {
  bucket: string;
  sample_count: number;
  risk_notes: string[];
}

export interface PickupPattern {
  location_group: string;
  total_samples: number;
  time_buckets: PickupTimeBucket[];
  destinations: string[];
  package_ids: number[];
}

export interface DropoffPattern {
  location_group: string;
  total_samples: number;
  destinations: string[];
  package_ids: number[];
}

export interface HotelMealRoomType {
  room_type_id: number;
  room_name: string | null;
  bed_type: string | null;
  rate_idr: number | null;
  rate_twt_idr: number | null;
  configurations: { pax: number | null; quantity: number | null }[];
}

export interface HotelMealSource {
  hotel_id: number;
  name: string | null;
  destination_id: number | null;
  lunch_rate: number | null;
  dinner_rate: number | null;
  room_types: HotelMealRoomType[];
}

export interface VehicleCostSource {
  vehicle_type_id: number;
  name: string | null;
  capacity_min_pax: number | null;
  capacity_max_pax: number | null;
  price_per_day: number | null;
  price_twt_per_day: number | null;
}

export interface CrewAssignmentRule {
  pax: number;
  vehicle_type_id: number | string | null;
  order_channel_id: number | null;
}

export interface CrewCostSource {
  crew_role_id: number;
  name: string | null;
  rate_per_day: number | null;
  rate_twt_per_day: number | null;
  order_channel_id: number | null;
  assignment_rules: CrewAssignmentRule[];
}

export interface ActivityActuals {
  sample_count: number;
  avg_qty: number;
  avg_price: number;
  avg_subtotal: number;
}

export interface ActivityCostSource {
  activity_id: number;
  scope: 'destination' | 'other';
  code: string | null;
  destination_id: number | null;
  name: string | null;
  unit: string | null;
  formula: string | null;
  list_price: number | null;
  actuals: ActivityActuals | null;
}

export interface ActualCostPattern {
  package_id: number | null;
  sample_count: number;
  avg_total_expense: number;
  avg_total_expense_crew: number;
  avg_profit: number;
}

export const emptyBackofficeExtract = (): BackofficeExtract => ({
  schema_version: 'backoffice-itinerary-core/v1',
  generated_at: null,
  source: 'new-backoffice',
  pii_policy: null,
  destination_registry: [],
  package_registry: [],
  pickup_patterns: [],
  dropoff_patterns: [],
  hotel_meal_sources: [],
  vehicle_cost_sources: [],
  crew_cost_sources: [],
  destination_activity_cost_sources: [],
  actual_cost_patterns: [],
  data_quality_notes: []
});
