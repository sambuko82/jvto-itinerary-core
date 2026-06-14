import type { BaseEntity } from './common.js';

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

export interface PickupContext extends BaseEntity {
  type: LocationType;
  location_group: string;
  default_ready_buffer_minutes: number;
  required_customer_fields: string[];
  risk_factors: string[];
  affects: string[];
}

export interface DropoffContext extends BaseEntity {
  type: LocationType;
  location_group: string;
  default_buffer_minutes: number;
  connects_to?: string[];
  required_customer_fields?: string[];
  cost_impacts: string[];
  risk_factors: string[];
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
