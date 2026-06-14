import type { SourceTrace } from '../domain/common.js';
import type { ScenarioDatasets } from './datasets.js';
import type { NormalizedScenario } from './types.js';
import type { RouteSelection } from './selectRoute.js';
import { unique } from './util.js';

export interface CostComponentResult {
  /** Component IDs that are defined in 10-cost-components.json (the joinable contract). */
  cost_components: string[];
  /** Referenced-but-undefined component IDs, surfaced as a data gap (not a final price). */
  unknown_cost_refs: string[];
  source_trace: SourceTrace[];
}

/** Baseline components present on every private overland tour. */
const BASELINE_COMPONENTS = ['vehicle_private_car_day', 'driver_cost'];

/**
 * Map the scenario to cost-component IDs only — no unit prices, subtotals, or totals (issue #2 Rule 5).
 * Sources: matched destination profiles (06), route legs (04), and selected operational events (07).
 */
export function mapCostComponents(
  scenario: NormalizedScenario,
  selection: RouteSelection,
  operationalEvents: string[],
  datasets: ScenarioDatasets
): CostComponentResult {
  const components: string[] = [...BASELINE_COMPONENTS];
  const traces: SourceTrace[] = [];

  // From destination activity profiles for each requested destination.
  for (const dest of scenario.destinations) {
    const profile = datasets.destinationProfiles.find((p) => p.destination_id === dest);
    if (profile) {
      components.push(...profile.cost_components);
      traces.push(...profile.source_trace);
    }
  }

  // From the selected route legs' cost impacts.
  for (const legId of selection.route_leg_ids) {
    const leg = datasets.routeLegs.find((l) => l.id === legId);
    if (leg?.cost_impacts) {
      components.push(...leg.cost_impacts);
      traces.push(...leg.source_trace);
    }
  }

  // From the operational events that fired.
  for (const eventId of operationalEvents) {
    const event = datasets.operationalEvents.find((e) => e.id === eventId);
    if (event?.cost_components) {
      components.push(...event.cost_components);
      traces.push(...event.source_trace);
    }
  }

  // Only emit IDs that are defined in 10-cost-components.json so downstream pricing can join on them;
  // referenced-but-undefined IDs are reported separately as a data gap.
  const known = new Set(datasets.costComponents.map((c) => c.id));
  const all = unique(components);
  return {
    cost_components: all.filter((id) => known.has(id)),
    unknown_cost_refs: all.filter((id) => !known.has(id)),
    source_trace: traces
  };
}
