import { GENERATED_DIR } from '../config/paths.js';
import { writeJson } from '../utils/fs.js';
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

export async function compileGeneratedData() {
  const files = [
    ['01-pickup-contexts.json', buildPickupContexts()],
    ['02-dropoff-contexts.json', buildDropoffContexts()],
    ['03-time-window-rules.json', buildTimeWindowRules()],
    ['04-route-leg-index.json', buildRouteLegIndex()],
    ['05-road-situation-profiles.json', buildRoadSituationProfiles()],
    ['06-destination-activity-profiles.json', buildDestinationActivityProfiles()],
    ['07-operational-events.json', buildOperationalEvents()],
    ['08-meal-logic.json', buildMealLogic()],
    ['09-accommodation-logic.json', buildAccommodationLogic()],
    ['10-cost-components.json', buildCostComponents()],
    ['11-package-route-map.json', buildPackageRouteMap()],
    ['12-recommendation-rules.json', buildRecommendationRules()],
    ['13-visual-map-layer.json', buildVisualMapLayer()],
    ['14-output-template-map.json', buildOutputTemplateMap()],
    ['15-scenario-preview-sample.json', buildScenarioPreview()]
  ] as const;

  for (const [file, data] of files) {
    await writeJson(`${GENERATED_DIR}/${file}`, data);
  }

  await writeJson(`${GENERATED_DIR}/manifest.json`, {
    generated_at: new Date().toISOString(),
    version: 1,
    status: 'initial_scaffold_with_manual_seed_data',
    file_count: files.length,
    files: files.map(([file]) => file),
    next_steps: [
      'Connect llm-wiki extractor',
      'Connect jvto-web route/destination extractor',
      'Connect new-backoffice redacted logistics and cost extractor',
      'Replace manual_seed fields with verified source_trace where possible'
    ]
  });

  return files.map(([file]) => `${GENERATED_DIR}/${file}`);
}
