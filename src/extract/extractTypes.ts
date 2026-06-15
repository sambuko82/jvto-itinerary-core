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

export interface JvtoWebExtract extends ExtractEnvelope {
  schema_model_count: number;
  restricted_model_count: number;
  models_by_domain: Record<string, string[]>;
  package_model_names: string[];
  route_model_names: string[];
  destination_model_names: string[];
  package_helpers: JvtoWebPackageHelper[];
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
