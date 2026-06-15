import { GENERATED_DIR } from '../config/paths.js';
import { writeJson } from '../utils/fs.js';
import { extractBackoffice } from '../extract/extract-backoffice.js';
import { buildPickupContexts } from './build-pickup-contexts.js';
import { buildDropoffContexts } from './build-dropoff-contexts.js';
import { buildTimeWindowRules } from './build-time-window-rules.js';
import { buildRouteLegIndex } from './build-route-leg-index.js';
import { buildRoadSituationProfiles } from './build-road-situation-profiles.js';
import { buildDestinationActivityProfiles } from './build-destination-activity-profiles.js';
import { buildOperationalEvents } from './build-operational-events.js';
import { buildMealLogic } from './build-meal-logic.js';
import { buildAccommodationLogic } from './build-accommodation-logic.js';
import { buildCostComponents } from './build-cost-components.js';
import { buildPackageRouteMap } from './build-package-route-map.js';
import { buildRecommendationRules } from './build-recommendation-rules.js';
import { buildVisualMapLayer } from './build-visual-map-layer.js';
import { buildOutputTemplateMap } from './build-output-template-map.js';
import { buildScenarioPreview } from './build-scenario-preview.js';
import { buildExportPayloads } from './build-export-payloads.js';

export async function compileGeneratedData() {
  // Phase 1B: enrich the operational/cost datasets with redacted new-backoffice
  // extract data. Missing export => empty extract; builders fall back to manual_seed.
  const backoffice = await extractBackoffice();
  const backofficeConnected = backoffice.pickup_patterns.length > 0 || backoffice.hotel_meal_sources.length > 0;

  const files = [
    ['01-pickup-contexts.json', buildPickupContexts(backoffice)],
    ['02-dropoff-contexts.json', buildDropoffContexts(backoffice)],
    ['03-time-window-rules.json', buildTimeWindowRules(backoffice)],
    ['04-route-leg-index.json', buildRouteLegIndex()],
    ['05-road-situation-profiles.json', buildRoadSituationProfiles()],
    ['06-destination-activity-profiles.json', buildDestinationActivityProfiles()],
    ['07-operational-events.json', buildOperationalEvents()],
    ['08-meal-logic.json', buildMealLogic()],
    ['09-accommodation-logic.json', buildAccommodationLogic(backoffice)],
    ['10-cost-components.json', buildCostComponents(backoffice)],
    ['11-package-route-map.json', buildPackageRouteMap()],
    ['12-recommendation-rules.json', buildRecommendationRules(backoffice)],
    ['13-visual-map-layer.json', buildVisualMapLayer()],
    ['14-output-template-map.json', buildOutputTemplateMap()],
    ['15-scenario-preview-sample.json', buildScenarioPreview()]
  ] as const;

  for (const [file, data] of files) {
    await writeJson(`${GENERATED_DIR}/${file}`, data);
  }

  const exportPayloads = buildExportPayloads();
  for (const payload of exportPayloads) {
    await writeJson(payload.path, payload.data);
  }

  await writeJson(`${GENERATED_DIR}/manifest.json`, {
    generated_at: 'manual_seed_deterministic',
    schema_version: 1,
    source_mode: 'manual_seed_mvp',
    output_count: files.length + exportPayloads.length,
    outputs: [
      ...files.map(([file]) => `${GENERATED_DIR}/${file}`),
      ...exportPayloads.map((payload) => payload.path)
    ],
    warnings: [
      'MVP output is generated from controlled manual seed data.',
      backofficeConnected
        ? 'new-backoffice extractor connected: datasets 01/02/03/09/10/12 carry backoffice_observed evidence and inferred source_trace where booking patterns matched.'
        : 'External source extraction hooks exist but are not connected in this MVP.',
      'backoffice_observed figures are aggregated, PII-free calibration evidence — not quotes or final prices.',
      'Cost payloads explain components only and do not produce final quote totals.',
      'Researched fields (confidence: inferred) come from web sources in seed/research/east-java-field-data-2026.json; re-verify fees/fares at booking time.',
      ...backoffice.data_quality_notes.map((note) => `backoffice: ${note}`)
    ],
    missing_data: [
      'distance_km for some legs still requires Mapbox/manual verification (corridor legs now researched)',
      backofficeConnected
        ? 'accommodation hotel->area mapping is best-effort pending the jvto-web destination crosswalk'
        : 'actual vehicle/crew/hotel rates require backoffice export ingestion',
      'real route polyline is not yet generated',
      'exact pickup/dropoff deadlines require customer travel details collected outside this PII-free sample',
      'Round 3 gaps: Tumpak Sewu access/guide/descent-time, Bromo opening hours + per-year Kasada dates + booking-vs-jeep timing, Ijen gas-mask-rental/local-guide mandate, Ketapang peak queue times'
    ],
    next_actions: [
      'Connect llm-wiki extractor',
      'Connect jvto-web route/destination extractor (needed for backoffice destination_id crosswalk)',
      backofficeConnected
        ? 'Replace redacted backoffice fixture with a real ExportDataItineraryCore export'
        : 'Connect new-backoffice redacted logistics and cost extractor',
      'Replace manual_seed fields with verified source_trace where possible',
      'Run deep-research round 3 for the remaining Tumpak Sewu / Bromo / Ijen-guide gaps'
    ],
    status: 'mvp_seed_outputs_ready'
  });

  return [...files.map(([file]) => `${GENERATED_DIR}/${file}`), ...exportPayloads.map((payload) => payload.path)];
}
