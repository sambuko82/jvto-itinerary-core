import { GENERATED_DIR } from '../config/paths.js';
import { writeJson } from '../utils/fs.js';
import { extractBackoffice } from '../extract/extract-backoffice.js';
import { extractJvtoWeb } from '../extract/extract-jvto-web.js';
import { promoteJvtoWebDestinationIntelligence } from './jvto-web-enrich.js';
import { enrichIjenHealthRequirement } from './enrich-ijen-health-requirement.js';
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
import { buildLocationCoordinateIndex } from './build-location-coordinate-index.js';
import { buildTomTomGeotagIndex } from './build-tomtom-geotag.js';
import { buildOutputTemplateMap } from './build-output-template-map.js';
import { buildScenarioPreview } from './build-scenario-preview.js';
import { buildExportPayloads } from './build-export-payloads.js';
import { buildPackageScenarioContext } from './build-package-scenario-context.js';

export async function compileGeneratedData() {
  // Phase 1B: enrich the operational/cost datasets with redacted new-backoffice
  // extract data. Missing export => empty extract; builders fall back to manual_seed.
  const backoffice = await extractBackoffice();
  const backofficeConnected = backoffice.pickup_patterns.length > 0 || backoffice.hotel_meal_sources.length > 0;

  // Phase 2 promotion: jvto-web destination intelligence (already at source) is
  // promoted into datasets 06/07/12. Additive — does not alter evaluator output.
  const jvtoWeb = await extractJvtoWeb();
  const destinationProfiles = buildDestinationActivityProfiles(backoffice);
  const operationalEvents = buildOperationalEvents(backoffice);
  const recommendationRules = buildRecommendationRules(backoffice);
  const jvtoWebPromoted = promoteJvtoWebDestinationIntelligence(
    jvtoWeb,
    destinationProfiles,
    operationalEvents,
    recommendationRules
  );

  // Attach the regulatory Ijen crater health-certificate gate to the
  // ijen_access_requirements event (extracted from field research; the jvto-web
  // snapshot models gear/permit/guide but no health requirement). Additive and
  // id-scoped — evaluator output is unchanged. Returns false when the event is
  // absent (no jvto-web snapshot), so the manifest warning below can stay honest.
  const ijenHealthEnriched = enrichIjenHealthRequirement(operationalEvents);

  // Verified destination coordinates from jvto-web power the map markers/bounds.
  const coordinateIndex = buildLocationCoordinateIndex(jvtoWeb.destination_details);

  // TomTom geotag index: fills transit-node coordinates (airport, harbor, staging town)
  // not present in the jvto-web destination registry. Deterministic — no live API call.
  const { index: geotagIndex, nodeIndex: tomtomNodeIndex } = await buildTomTomGeotagIndex();
  const tomtomData = { geotagIndex, nodeIndex: tomtomNodeIndex };

  const [visualMapLayer] = buildVisualMapLayer(coordinateIndex, tomtomData);
  const mapPointsWithCoords = visualMapLayer.points.filter((p) => p.lat != null).length;

  const files = [
    ['01-pickup-contexts.json', buildPickupContexts(backoffice)],
    ['02-dropoff-contexts.json', buildDropoffContexts(backoffice)],
    ['03-time-window-rules.json', buildTimeWindowRules(backoffice)],
    ['04-route-leg-index.json', buildRouteLegIndex()],
    ['05-road-situation-profiles.json', buildRoadSituationProfiles()],
    ['06-destination-activity-profiles.json', destinationProfiles],
    ['07-operational-events.json', operationalEvents],
    ['08-meal-logic.json', buildMealLogic(backoffice)],
    ['09-accommodation-logic.json', buildAccommodationLogic(backoffice)],
    ['10-cost-components.json', buildCostComponents(backoffice)],
    ['11-package-route-map.json', buildPackageRouteMap(backoffice)],
    ['12-recommendation-rules.json', recommendationRules],
    ['13-visual-map-layer.json', [visualMapLayer]],
    ['14-output-template-map.json', buildOutputTemplateMap()],
    ['15-scenario-preview-sample.json', buildScenarioPreview()],
    ['28-tomtom-geotag-index.json', [geotagIndex]]
  ] as const;

  for (const [file, data] of files) {
    await writeJson(`${GENERATED_DIR}/${file}`, data);
  }

  // Generated datasets (incl. 11-package-route-map) are now on disk, so the
  // package-aware scenario can be evaluated and threaded into the export payloads.
  const packageContext = await buildPackageScenarioContext();
  const exportPayloads = buildExportPayloads(packageContext, visualMapLayer);
  for (const payload of exportPayloads) {
    await writeJson(payload.path, payload.data);
  }

  await writeJson(`${GENERATED_DIR}/manifest.json`, {
    generated_at: 'manual_seed_deterministic',
    schema_version: 1,
    // Reconciled with the extraction manifest: the dataset pipeline is
    // source-connected (llm-wiki + jvto-web + new-backoffice extractors). The
    // dataset *content* is still seed values calibrated by connected-source
    // evidence — recorded as legacy_dataset_mode (mirrors extraction-manifest).
    source_mode: 'source_connected',
    legacy_dataset_mode: 'manual_seed_mvp',
    output_count: files.length + exportPayloads.length,
    outputs: [
      ...files.map(([file]) => `${GENERATED_DIR}/${file}`),
      ...exportPayloads.map((payload) => payload.path)
    ],
    warnings: [
      'Dataset pipeline is source-connected; dataset fields are seed values calibrated by connected-source evidence (legacy_dataset_mode=manual_seed_mvp), carrying verified/inferred source_trace where matched.',
      backofficeConnected
        ? 'new-backoffice extractor connected: datasets 01/02/03/06/07/08/09/10/11/12 carry backoffice_observed evidence and inferred source_trace where booking/reference data matched.'
        : 'External source extraction hooks exist but are not connected in this MVP.',
      jvtoWebPromoted > 0
        ? `jvto-web destination intelligence promoted from destinationDetailSnapshots for ${jvtoWebPromoted} destinations: 06 carries physical_demand/difficulty_level/altitude/trail_details; 07 adds <dest>_access_requirements (gear/permit/guide); 12 adds <dest>_weather_risk_advisory (weather/rainfall/risk_factors). All carry jvto_web source_trace; evaluator output is unchanged.`
        : 'jvto-web destination detail snapshot absent: destination intelligence not promoted.',
      ijenHealthEnriched
        ? 'ijen_access_requirements (07) additionally carries health_certificate_required + a health_screening block, extracted from field research (ijen_rules.medical_check) — a mandatory surat-sehat crater-access gate (effective 2024-01-06, on-site option at Paltuding). Regulatory fact only; no operator-workflow copy.'
        : 'ijen_access_requirements event absent (no jvto-web destination snapshot): health-certificate gate not attached.',
      'backoffice_observed figures are aggregated, PII-free calibration evidence — not quotes or final prices.',
      'Cost payloads explain components only and do not produce final quote totals.',
      'Researched fields (confidence: inferred) come from web sources in seed/research/east-java-field-data-2026.json; re-verify fees/fares at booking time.',
      ...backoffice.data_quality_notes.map((note) => `backoffice: ${note}`)
    ],
    missing_data: [
      'distance_km for some legs still requires Mapbox/manual verification (corridor legs now researched)',
      backofficeConnected
        ? `destination crosswalk (jvto-web) maps area->core id; numeric backoffice destination_id is verified by slug-join against the bundle destinations registry (${backoffice.destination_registry.length} records) and falls back to a flagged placeholder when absent`
        : 'actual vehicle/crew/hotel rates require backoffice export ingestion',
      `visual map layer: ${mapPointsWithCoords}/${visualMapLayer.points.length} markers carry verified coordinates (jvto-web + TomTom); route_lines are great-circle placeholders until fill-tomtom-routing.mjs is run`,
      'exact pickup/dropoff deadlines require customer travel details collected outside this PII-free sample',
      'Round 3 gaps: Tumpak Sewu access/guide/descent-time, Bromo opening hours + per-year Kasada dates + booking-vs-jeep timing, Ijen gas-mask-rental/local-guide mandate, Ketapang peak queue times'
    ],
    next_actions: [
      'Phase 2 done: llm-wiki + jvto-web + new-backoffice extractors connected (see generated/itinerary-intelligence/extraction-manifest.json, source_mode=source_connected)',
      'Phase 3: build package-catalog-index + location-alias-registry + route-node-index from connected extracts',
      backofficeConnected
        ? 'Replace redacted backoffice fixture with a real ExportDataItineraryCore export'
        : 'Connect new-backoffice redacted logistics and cost extractor',
      'Replace remaining manual_seed dataset fields with verified source_trace where possible',
      'Run deep-research round 3 for the remaining Tumpak Sewu / Bromo / Ijen-guide gaps'
    ],
    status: 'mvp_seed_outputs_ready'
  });

  return [...files.map(([file]) => `${GENERATED_DIR}/${file}`), ...exportPayloads.map((payload) => payload.path)];
}
