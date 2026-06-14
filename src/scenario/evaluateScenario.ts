import type { SourceTrace } from '../domain/common.js';
import { loadScenarioDatasets, type ScenarioDatasets } from './datasets.js';
import { normalizeScenarioInput } from './normalizeScenarioInput.js';
import { selectRoute } from './selectRoute.js';
import { applyTimeRules } from './applyTimeRules.js';
import { applyRecommendationRules } from './applyRecommendationRules.js';
import { applyOperationalEvents } from './applyOperationalEvents.js';
import { mapCostComponents } from './mapCostComponents.js';
import { dedupeSourceTrace, MVP_DATA_GAPS, unique } from './util.js';
import type { RawScenarioInput, ScenarioEvaluation, ScenarioStatus } from './types.js';

function deriveStatus(input: { feasible: boolean; manualReview: boolean; warningCount: number }): ScenarioStatus {
  if (!input.feasible) return 'not_recommended';
  if (input.manualReview) return 'needs_manual_review';
  if (input.warningCount > 0) return 'possible_with_warning';
  return 'recommended';
}

/**
 * Deterministically evaluate a customer scenario into the flat issue-#2 contract:
 * route recommendation, feasibility warnings, operational events, and cost-component IDs.
 * Reads the generated itinerary-intelligence datasets; performs no pricing and emits no raw PII.
 */
export async function evaluateScenario(
  raw: RawScenarioInput,
  datasets?: ScenarioDatasets
): Promise<ScenarioEvaluation> {
  const ds = datasets ?? (await loadScenarioDatasets());

  const scenario = normalizeScenarioInput(raw, ds);
  const selection = selectRoute(scenario, ds);
  const time = applyTimeRules(scenario, selection, ds);
  const recommendations = applyRecommendationRules(scenario, selection, ds);
  const operational = applyOperationalEvents(scenario, selection, ds);
  const cost = mapCostComponents(scenario, selection, operational.events, ds);

  const warnings = unique([...selection.infeasible_reasons, ...time.warnings]);
  const manualReview = scenario.pickup.needs_manual_geocoding || scenario.dropoff.needs_manual_geocoding;
  const status = deriveStatus({ feasible: selection.feasible, manualReview, warningCount: warnings.length });

  const nextRequiredInfo = unique([
    ...scenario.missing_required_fields,
    ...(cost.unknown_cost_refs.length > 0
      ? [`cost-component references not yet defined in 10-cost-components.json: ${cost.unknown_cost_refs.join(', ')}`]
      : []),
    ...MVP_DATA_GAPS
  ]);

  const sourceTrace: SourceTrace[] = dedupeSourceTrace([
    ...scenario.source_trace,
    ...selection.source_trace,
    ...time.source_trace,
    ...recommendations.source_trace,
    ...operational.source_trace,
    ...cost.source_trace,
    { source: 'generated', ref: 'generated/itinerary-intelligence', confidence: 'manual_seed' }
  ]);

  return {
    status,
    recommended_route: selection.recommended_route,
    route_leg_ids: selection.route_leg_ids,
    warnings,
    operational_events: operational.events,
    cost_components: cost.cost_components,
    better_route_notes: recommendations.better_route_notes,
    next_required_info: nextRequiredInfo,
    source_trace: sourceTrace
  };
}
