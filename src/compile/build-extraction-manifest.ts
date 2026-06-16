import { INVENTORY_SCHEMA_VERSION, inventoryGeneratedAt } from '../config/inventory-meta.js';
import { extractLlmWiki } from '../extract/extract-llm-wiki.js';
import { extractJvtoWeb } from '../extract/extract-jvto-web.js';
import { extractBackoffice } from '../extract/extract-backoffice.js';
import type { LlmWikiExtract, JvtoWebExtract, ExtractionManifest, ExtractorStatus } from '../extract/extractTypes.js';
import type { BackofficeExtract } from '../extract/sourceTypes.js';

export interface ExtractionBundle {
  manifest: ExtractionManifest;
  llmWiki: LlmWikiExtract;
  jvtoWeb: JvtoWebExtract;
  backoffice: BackofficeExtract;
}

/**
 * Phase 2 — Extractor Connection.
 * Runs all three connected extractors against the committed input/ snapshots and
 * produces a deterministic extraction-manifest declaring source_mode:source_connected.
 */
export async function buildExtractionManifest(): Promise<ExtractionBundle> {
  const generated_at = inventoryGeneratedAt();
  const [llmWiki, jvtoWeb, backoffice] = await Promise.all([
    extractLlmWiki(),
    extractJvtoWeb(),
    extractBackoffice()
  ]);

  // backoffice missing_fields: empty sections in the bundle
  const boMissing: string[] = [];
  if (backoffice.destination_registry.length === 0) boMissing.push('destination_registry');
  if (backoffice.package_registry.length === 0) boMissing.push('package_registry');
  if (backoffice.hotel_meal_sources.length === 0) boMissing.push('hotel_meal_sources');

  const extractors: ExtractorStatus[] = [
    {
      extractor: 'llm_wiki',
      connected: llmWiki.packages.length > 0,
      primary_source: 'input/llm-wiki/package-readiness/',
      record_counts: {
        packages: llmWiki.packages.length,
        pricing: llmWiki.pricing.length,
        itineraries: llmWiki.itineraries.length,
        booking_compatibility: llmWiki.booking_compatibility.length
      },
      missing_fields: llmWiki.missing_fields,
      source_trace: llmWiki.source_trace
    },
    {
      extractor: 'jvto_web',
      connected: jvtoWeb.schema_model_count > 0,
      primary_source: 'input/jvto-web/',
      record_counts: {
        models: jvtoWeb.schema_model_count,
        restricted_models: jvtoWeb.restricted_model_count,
        package_helpers: jvtoWeb.package_helpers.length
      },
      missing_fields: jvtoWeb.missing_fields,
      source_trace: jvtoWeb.source_trace
    },
    {
      extractor: 'new_backoffice',
      connected: backoffice.pickup_patterns.length > 0 || backoffice.hotel_meal_sources.length > 0,
      primary_source: 'input/new-backoffice/exports/itinerary-core-bundle.json',
      record_counts: {
        pickup_patterns: backoffice.pickup_patterns.length,
        dropoff_patterns: backoffice.dropoff_patterns.length,
        hotels: backoffice.hotel_meal_sources.length,
        vehicles: backoffice.vehicle_cost_sources.length,
        crew_roles: backoffice.crew_cost_sources.length,
        activities: backoffice.destination_activity_cost_sources.length,
        finance_patterns: backoffice.actual_cost_patterns.length,
        package_templates: backoffice.package_registry.length
      },
      missing_fields: boMissing,
      source_trace: [
        { repo: 'jvto-devteam/new-backoffice', path: 'app/Http/Controllers/ExportData/ExportDataItineraryCore.php', field: 'bundle' }
      ]
    }
  ];

  const allConnected = extractors.every((e) => e.connected);

  const manifest: ExtractionManifest = {
    schema_version: INVENTORY_SCHEMA_VERSION,
    source_mode: 'source_connected',
    generated_at,
    legacy_dataset_mode: 'manual_seed_mvp',
    extractors,
    status: allConnected ? 'active' : 'incomplete',
    source_trace: extractors.flatMap((e) => e.source_trace)
  };

  return { manifest, llmWiki, jvtoWeb, backoffice };
}
