import { GENERATED_DIR, SAMPLES_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { evaluateScenarioFromFile, type ScenarioEvaluation } from '../scenario/evaluateScenario.js';
import type { ItineraryScenario } from '../domain/itinerary.js';

/**
 * Package-aware scenario context for the export payloads.
 *
 * Threads the result of evaluating the package-aware scenario
 * (`bromo-ijen-bali-4d3n`) — together with that package's PII-free
 * `backoffice_observed` structure from `11-package-route-map.json` — into the
 * generated export payloads, so downstream consumers (page / pdf / ops / ai)
 * can see the package baseline route plus its day/hotel/destination shape.
 *
 * This carries NO rates or totals: cost_components are canonical IDs only and
 * `package_structure` is aggregated calibration evidence, not a quotation.
 */
const PACKAGE_SCENARIO_SAMPLE = 'customer-scenario-package-bromo-ijen-bali-4d3n.json';

export interface PackageScenarioContext {
  scenario_id: string;
  package_route_id: string | null;
  status: ScenarioEvaluation['status'];
  duration_days: number;
  recommended_route_sequence: string[];
  route_leg_ids: string[];
  operational_events: string[];
  meal_logic: string[];
  accommodation_logic: string[];
  cost_components: string[];
  warnings: string[];
  /** PII-free package template shape (backoffice_observed) from dataset 11. */
  package_structure: Record<string, unknown> | null;
  source_trace: ScenarioEvaluation['source_trace'];
}

export async function buildPackageScenarioContext(): Promise<PackageScenarioContext> {
  const scenario = await readJson<ItineraryScenario>(`${SAMPLES_DIR}/${PACKAGE_SCENARIO_SAMPLE}`);
  const evaluation = await evaluateScenarioFromFile(scenario);

  const packageRouteMap = await readJson<Array<Record<string, unknown>>>(
    `${GENERATED_DIR}/11-package-route-map.json`
  );
  const entry = evaluation.package_route_id
    ? packageRouteMap.find((p) => p.package_id === evaluation.package_route_id)
    : undefined;
  const packageStructure = (entry?.backoffice_observed as Record<string, unknown> | undefined) ?? null;

  return {
    scenario_id: scenario.scenario_id,
    package_route_id: evaluation.package_route_id,
    status: evaluation.status,
    duration_days: scenario.duration_days,
    recommended_route_sequence: evaluation.recommended_route,
    route_leg_ids: evaluation.route_leg_ids,
    operational_events: evaluation.operational_events,
    meal_logic: evaluation.meal_logic,
    accommodation_logic: evaluation.accommodation_logic,
    cost_components: evaluation.cost_components,
    warnings: evaluation.warnings,
    package_structure: packageStructure,
    source_trace: evaluation.source_trace
  };
}
