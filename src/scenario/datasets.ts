import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import type { SourceTrace } from '../domain/common.js';

/**
 * Light read-models for the generated datasets the scenario engine consumes.
 * These intentionally describe only the fields the evaluator reads; the full
 * shapes live in src/domain and the build-* compilers.
 */

export interface PickupContextData {
  id: string;
  label: string;
  type: string;
  location_group: string;
  default_ready_buffer_minutes: number;
  required_customer_fields: string[];
  source_trace: SourceTrace[];
}

export interface DropoffContextData {
  id: string;
  label: string;
  type: string;
  location_group: string;
  default_buffer_minutes: number;
  connects_to?: string[];
  required_customer_fields?: string[];
  source_trace: SourceTrace[];
}

export interface TimeWindowRuleData {
  id: string;
  label: string;
  condition: Record<string, unknown>;
  impact: string[];
  recommendation: string;
  severity: string;
  source_trace: SourceTrace[];
}

export interface RouteLegData {
  id: string;
  from_location: string;
  to_location: string;
  cost_impacts?: string[];
  source_trace: SourceTrace[];
}

export interface DestinationProfileData {
  id: string;
  destination_id: string;
  activity_window: Record<string, string>;
  required_prior_events?: string[];
  dependencies: string[];
  fatigue_score: number;
  cost_components: string[];
  warning_rules: string[];
  source_trace: SourceTrace[];
}

export interface OperationalEventData {
  id: string;
  label: string;
  event_type: string;
  applies_when: string[];
  typical_sequence: string[];
  customer_visible: boolean | string;
  cost_components?: string[];
  source_trace: SourceTrace[];
}

export interface CostComponentData {
  id: string;
  label: string;
  category: string;
  customer_visible: boolean | string;
  source_trace: SourceTrace[];
}

export interface PackageRouteMapData {
  package_id: string;
  label: string;
  origin: string;
  duration: string;
  route_sequence: string[];
  route_legs: string[];
  standard_dropoff_options: string[];
  possible_customizations: string[];
  source_trace: SourceTrace[];
}

export interface RecommendationRuleData {
  id: string;
  label: string;
  condition: Record<string, unknown>;
  severity: string;
  recommendation: string;
  alternatives: string[];
  source_trace: SourceTrace[];
}

export interface ScenarioDatasets {
  pickupContexts: PickupContextData[];
  dropoffContexts: DropoffContextData[];
  timeWindowRules: TimeWindowRuleData[];
  routeLegs: RouteLegData[];
  destinationProfiles: DestinationProfileData[];
  operationalEvents: OperationalEventData[];
  costComponents: CostComponentData[];
  packageRouteMap: PackageRouteMapData[];
  recommendationRules: RecommendationRuleData[];
}

/**
 * Load the generated itinerary-intelligence datasets the evaluator depends on.
 * Reads the existing SSOT JSON output; it does not invoke any extractor.
 */
export async function loadScenarioDatasets(dir = GENERATED_DIR): Promise<ScenarioDatasets> {
  const [
    pickupContexts,
    dropoffContexts,
    timeWindowRules,
    routeLegs,
    destinationProfiles,
    operationalEvents,
    costComponents,
    packageRouteMap,
    recommendationRules
  ] = await Promise.all([
    readJson<PickupContextData[]>(`${dir}/01-pickup-contexts.json`),
    readJson<DropoffContextData[]>(`${dir}/02-dropoff-contexts.json`),
    readJson<TimeWindowRuleData[]>(`${dir}/03-time-window-rules.json`),
    readJson<RouteLegData[]>(`${dir}/04-route-leg-index.json`),
    readJson<DestinationProfileData[]>(`${dir}/06-destination-activity-profiles.json`),
    readJson<OperationalEventData[]>(`${dir}/07-operational-events.json`),
    readJson<CostComponentData[]>(`${dir}/10-cost-components.json`),
    readJson<PackageRouteMapData[]>(`${dir}/11-package-route-map.json`),
    readJson<RecommendationRuleData[]>(`${dir}/12-recommendation-rules.json`)
  ]);

  return {
    pickupContexts,
    dropoffContexts,
    timeWindowRules,
    routeLegs,
    destinationProfiles,
    operationalEvents,
    costComponents,
    packageRouteMap,
    recommendationRules
  };
}
