import type { SourceTrace } from '../domain/common.js';
import type { ScenarioDatasets, TimeWindowRuleData } from './datasets.js';
import type { NormalizedScenario } from './types.js';
import type { RouteSelection } from './selectRoute.js';
import { LATE_ARRIVAL_MINUTES, unique } from './util.js';

export interface TimeRuleResult {
  warnings: string[];
  source_trace: SourceTrace[];
}

/** Pickup types where a late time is an exogenous risk (vs. a deliberately scheduled night start). */
const EXOGENOUS_PICKUP = new Set(['airport', 'train_station', 'harbor']);

function ruleById(datasets: ScenarioDatasets, id: string): TimeWindowRuleData | undefined {
  return datasets.timeWindowRules.find((rule) => rule.id === id);
}

/**
 * Apply time-window rules (dataset 03) plus issue #2 Rule 1/4 to produce risk warnings.
 * Only real feasibility/fatigue risks land here; MVP data gaps are reported via next_required_info.
 */
export function applyTimeRules(
  scenario: NormalizedScenario,
  selection: RouteSelection,
  datasets: ScenarioDatasets
): TimeRuleResult {
  const warnings: string[] = [];
  const traces: SourceTrace[] = [];
  const dests = scenario.destinations;
  const lateArrival =
    scenario.arrival_minutes != null &&
    scenario.arrival_minutes > LATE_ARRIVAL_MINUTES &&
    EXOGENOUS_PICKUP.has(scenario.pickup.type);

  // Issue #2 Rule 1 — late airport arrival.
  if (lateArrival && scenario.pickup.type === 'airport' && (dests.includes('bromo') || dests.includes('ijen'))) {
    warnings.push('Late airport arrival may reduce rest time and cause late mountain-area check-in.');
  }

  // Dataset 03: late arrival before Ijen.
  if (lateArrival && dests.includes('ijen')) {
    const rule = ruleById(datasets, 'late_arrival_before_ijen');
    if (rule) {
      warnings.push(rule.recommendation);
      traces.push(...rule.source_trace);
    }
  }

  // Dataset 03: late Surabaya arrival before Bromo sunrise.
  if (lateArrival && dests.includes('bromo') && /surabaya/i.test(scenario.pickup.location)) {
    const rule = ruleById(datasets, 'late_surabaya_arrival_before_bromo');
    if (rule) {
      warnings.push(rule.recommendation);
      traces.push(...rule.source_trace);
    }
  }

  // Dataset 03 / issue #2 Rule 4: waterfall before a tight airport dropoff.
  const lastDestination = selection.recommended_route[selection.recommended_route.length - 2]?.toLowerCase() ?? '';
  const waterfallLast = /madakaripura|tumpak/.test(lastDestination);
  if (scenario.dropoff.type === 'airport' && waterfallLast) {
    const rule = ruleById(datasets, 'airport_dropoff_cutoff_after_waterfall');
    if (rule) {
      warnings.push(rule.recommendation);
      traces.push(...rule.source_trace);
    }
  }

  // Ijen fatigue note when included with any tight schedule.
  if (dests.includes('ijen') && lateArrival) {
    warnings.push('Ijen requires a midnight departure and a health check before trekking; reduced rest increases fatigue.');
  }

  return { warnings: unique(warnings), source_trace: traces };
}
