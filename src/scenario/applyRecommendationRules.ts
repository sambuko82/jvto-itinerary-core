import type { SourceTrace } from '../domain/common.js';
import type { ScenarioDatasets } from './datasets.js';
import type { NormalizedScenario } from './types.js';
import type { RouteSelection } from './selectRoute.js';
import { LATE_ARRIVAL_MINUTES, unique } from './util.js';

export interface RecommendationResult {
  better_route_notes: string[];
  source_trace: SourceTrace[];
}

/**
 * Apply recommendation rules (dataset 12) to produce better_route_notes.
 * Each fired rule contributes its recommendation plus its alternatives.
 */
export function applyRecommendationRules(
  scenario: NormalizedScenario,
  selection: RouteSelection,
  datasets: ScenarioDatasets
): RecommendationResult {
  const notes: string[] = [];
  const traces: SourceTrace[] = [];
  const dests = scenario.destinations;
  const lateArrival = scenario.arrival_minutes != null && scenario.arrival_minutes > LATE_ARRIVAL_MINUTES;

  for (const rule of datasets.recommendationRules) {
    let fires = false;
    switch (rule.id) {
      case 'avoid_backtracking_ijen_bromo_ketapang':
        fires = selection.east_bound_dropoff && dests.includes('bromo') && dests.includes('ijen');
        break;
      case 'late_airport_arrival_requires_rest_warning':
        fires = scenario.pickup.type === 'airport' && lateArrival && (dests.includes('bromo') || dests.includes('ijen'));
        break;
      case 'waterfall_before_airport_deadline_risk': {
        const lastDestination = selection.recommended_route[selection.recommended_route.length - 2]?.toLowerCase() ?? '';
        fires = scenario.dropoff.type === 'airport' && /madakaripura|tumpak/.test(lastDestination);
        break;
      }
      default:
        fires = false;
    }
    if (fires) {
      notes.push(rule.recommendation, ...rule.alternatives);
      traces.push(...rule.source_trace);
    }
  }

  // Feasibility-driven note: suggest adding nights when the route does not fit.
  if (!selection.feasible) {
    notes.push('Add one or more nights, or reduce the destination count, so each major activity has an overnight before it.');
  }

  return { better_route_notes: unique(notes), source_trace: traces };
}
