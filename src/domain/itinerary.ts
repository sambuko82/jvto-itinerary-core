import { z } from 'zod';
import type { BaseEntity, BackofficeObserved } from './common.js';

export type LocationType =
  | 'airport'
  | 'hotel'
  | 'train_station'
  | 'harbor'
  | 'city_point'
  | 'custom_address'
  | 'bali_area'
  | 'destination_area';

export interface TravelEndpoint {
  type: LocationType;
  location: string;
  detail?: string;
  time?: string;
  ticket_number?: string;
}

export interface ItineraryScenario {
  scenario_id: string;
  channel?: 'JVTO' | 'KLOOK' | 'TWT' | 'CUSTOM';
  /** Optional package template slug, joinable to 11-package-route-map.json. */
  package_slug?: string;
  pickup: TravelEndpoint;
  dropoff: TravelEndpoint;
  pax: number;
  duration_days: number;
  requested_destinations: string[];
  arrival_time?: string;
  departure_deadline?: string;
  hotel_preference?: string;
  route_preference?: string;
  luggage_context?: string;
}

// ─── Runtime validation (zod) ───
// Mirrors TravelEndpoint/ItineraryScenario above. Uses .passthrough() because
// real customer scenarios (see samples/*.json) carry additional per-booking
// keys beyond the typed fields (e.g. flight_number, origin_city, constraints)
// that evaluateScenario reads dynamically via required_customer_fields lookups.
export const locationTypeSchema = z.enum([
  'airport',
  'hotel',
  'train_station',
  'harbor',
  'city_point',
  'custom_address',
  'bali_area',
  'destination_area'
]);

export const travelEndpointSchema = z
  .object({
    type: locationTypeSchema,
    location: z.string(),
    detail: z.string().optional(),
    time: z.string().optional(),
    ticket_number: z.string().optional()
  })
  .passthrough();

export const itineraryScenarioSchema = z
  .object({
    scenario_id: z.string(),
    channel: z.enum(['JVTO', 'KLOOK', 'TWT', 'CUSTOM']).optional(),
    package_slug: z.string().optional(),
    pickup: travelEndpointSchema,
    dropoff: travelEndpointSchema,
    pax: z.number(),
    duration_days: z.number(),
    requested_destinations: z.array(z.string()),
    arrival_time: z.string().optional(),
    departure_deadline: z.string().optional(),
    hotel_preference: z.string().optional(),
    route_preference: z.string().optional(),
    luggage_context: z.string().optional()
  })
  .passthrough();

export interface PickupContext extends BaseEntity {
  type: LocationType;
  location_group: string;
  default_ready_buffer_minutes: number;
  required_customer_fields: string[];
  risk_factors: string[];
  affects: string[];
  backoffice_observed?: BackofficeObserved;
}

export interface DropoffContext extends BaseEntity {
  type: LocationType;
  location_group: string;
  default_buffer_minutes: number;
  connects_to?: string[];
  required_customer_fields?: string[];
  cost_impacts: string[];
  risk_factors: string[];
  backoffice_observed?: BackofficeObserved;
}

export interface RouteLeg extends BaseEntity {
  from_location: string;
  to_location: string;
  distance_km?: number | null;
  /** Researched plausible distance range when a single value is route-dependent. */
  distance_km_range?: string;
  research_note?: string;
  duration_text: string;
  duration_normal_minutes?: number | null;
  duration_busy_minutes?: number | null;
  road_profiles: string[];
  risk_factors: string[];
  meal_stop_possible?: boolean;
  night_drive_possible?: boolean;
  recommended_departure_window?: string;
  used_by_packages?: string[];
  cost_impacts?: string[];
}
