import type { InventorySourceTrace } from '../config/inventory-meta.js';

/** Common envelope for a connected, normalized source extract (Phase 2). */
export interface ExtractEnvelope {
  source_mode: 'source_connected';
  generated_at: string;
  status: 'active' | 'incomplete' | 'deprecated';
  source_trace: InventorySourceTrace[];
  manual_fields: string[];
  missing_fields: string[];
}

export interface LlmWikiPackage {
  package_id: string;
  slug: string;
  origin: string | null;
  duration: string | null;
  public_url: string | null;
  ijen_relevant: boolean | null;
  visits_madakaripura: boolean | null;
  is_specialty: boolean | null;
}

export interface LlmWikiPricing {
  package_id: string;
  slug: string;
  currency: string | null;
  ferry_included: boolean | null;
  pax_tier_count: number;
  idr_per_person_min: number | null;
  idr_per_person_max: number | null;
}

export interface LlmWikiItinerary {
  package_id: string;
  slug: string;
  day_count: number;
  day_titles: string[];
}

export interface LlmWikiCompatibility {
  package_id: string;
  slug: string;
  instant_book: boolean | null;
  whatsapp_assisted: boolean | null;
}

export interface LlmWikiExtract extends ExtractEnvelope {
  packages: LlmWikiPackage[];
  pricing: LlmWikiPricing[];
  itineraries: LlmWikiItinerary[];
  booking_compatibility: LlmWikiCompatibility[];
}

export interface JvtoWebPackageHelper {
  path: string;
  exports: string[];
}

/** PII-safe travel movement from a jvto-web TravelAction activity. */
export interface JvtoWebActivity {
  action_type: string | null;
  action_name: string | null;
  time_window: string | null;
  duration_minutes: number | null;
  from_location: string | null;
  to_location: string | null;
  destination: string | null;
}

export interface JvtoWebItineraryDay {
  day: number | null;
  title: string | null;
  summary: string | null;
  activities: JvtoWebActivity[];
}

export interface JvtoWebPackageDetail {
  public_url: string;
  product_slug: string | null;
  origin_city: string | null;
  end_city: string | null;
  route_labels: string[];
  key_experiences: string[];
  accommodation_areas: string[];
  addon_types: string[];
  addon_transport_destinations: string[];
  itinerary_days: JvtoWebItineraryDay[];
}

export interface JvtoWebRiskFactor {
  type: string | null;
  level: string | null;
  mitigation: string | null;
  description: string | null;
}

/** PII-safe destination-intelligence subset of destinationDetailSnapshots. */
export interface JvtoWebDestinationDetail {
  slug: string;
  // Not `name`: the extraction PII guard blocks any `name` key in the persisted extract.
  destination_label: string | null;
  // Verified geographic coordinates from the jvto-web destination registry.
  latitude: number | null;
  longitude: number | null;
  physical_demand: number | null;
  difficulty_level: string | null;
  altitude: number | null;
  trail_details: string | null;
  required_gear: string[];
  permit_required: boolean | null;
  permit_details: string | null;
  guide_required: boolean | null;
  weather_by_season: string | null;
  rainfall_intensity: string | null;
  risk_factors: JvtoWebRiskFactor[];
}

export interface JvtoWebExtract extends ExtractEnvelope {
  schema_model_count: number;
  restricted_model_count: number;
  models_by_domain: Record<string, string[]>;
  package_model_names: string[];
  route_model_names: string[];
  destination_model_names: string[];
  package_helpers: JvtoWebPackageHelper[];
  package_detail_count: number;
  package_details: JvtoWebPackageDetail[];
  destination_detail_count: number;
  destination_details: JvtoWebDestinationDetail[];
}

export interface ExtractorStatus {
  extractor: 'llm_wiki' | 'jvto_web' | 'new_backoffice';
  connected: boolean;
  primary_source: string;
  record_counts: Record<string, number>;
  missing_fields: string[];
  source_trace: InventorySourceTrace[];
}

export interface ExtractionManifest {
  schema_version: string;
  source_mode: 'source_connected';
  generated_at: string;
  legacy_dataset_mode: string;
  extractors: ExtractorStatus[];
  status: 'active' | 'incomplete';
  source_trace: InventorySourceTrace[];
}
