import type { LocationType } from '../domain/itinerary.js';
import type { SourceTrace } from '../domain/common.js';

/**
 * Canonical status vocabulary, aligned with issue #2.
 * The "impossible" case maps to `not_recommended`; a clean feasible case maps to `recommended`.
 */
export type ScenarioStatus =
  | 'recommended'
  | 'possible_with_warning'
  | 'not_recommended'
  | 'needs_manual_review';

/** Nested endpoint shape (matches samples/customer-scenario-*.json and domain ItineraryScenario). */
export interface NestedEndpointInput {
  type?: string;
  location?: string;
  time?: string;
  deadline_time?: string;
  [key: string]: unknown;
}

/**
 * Raw scenario input accepted by the evaluator. Supports BOTH the nested shape and the flat shape
 * (pickup_type / pickup_location / arrival_time / destinations). The normalizer reconciles them.
 */
export interface RawScenarioInput {
  // nested form
  pickup?: NestedEndpointInput;
  dropoff?: NestedEndpointInput;
  // flat form
  pickup_type?: string;
  pickup_location?: string;
  pickup_time?: string;
  dropoff_type?: string;
  dropoff_location?: string;
  dropoff_deadline?: string;
  // shared
  arrival_time?: string;
  pax?: number;
  duration_days?: number;
  requested_destinations?: string[];
  destinations?: string[];
  constraints?: string[];
  package_id?: string;
  channel?: string;
}

export interface NormalizedEndpoint {
  role: 'pickup' | 'dropoff';
  type: LocationType;
  location: string;
  /** Resolved context id from 01/02 datasets, or null when no context matched. */
  context_id: string | null;
  context_label: string | null;
  time_hhmm: string | null;
  time_minutes: number | null;
  default_buffer_minutes: number | null;
  /** For pickup: ready-to-depart minutes. For dropoff: latest-safe deadline minutes. */
  derived_minutes: number | null;
  missing_required_fields: string[];
  needs_manual_geocoding: boolean;
}

export interface NormalizedScenario {
  pickup: NormalizedEndpoint;
  dropoff: NormalizedEndpoint;
  pax: number;
  duration_days: number;
  /** Canonical destination ids (e.g. "bromo", "ijen", "madakaripura"). */
  destinations: string[];
  arrival_minutes: number | null;
  arrival_hhmm: string | null;
  constraints: string[];
  missing_required_fields: string[];
  source_trace: SourceTrace[];
}

/** The flat, canonical evaluation contract per issue #2. */
export interface ScenarioEvaluation {
  status: ScenarioStatus;
  recommended_route: string[];
  route_leg_ids: string[];
  warnings: string[];
  operational_events: string[];
  cost_components: string[];
  better_route_notes: string[];
  next_required_info: string[];
  source_trace: SourceTrace[];
}
