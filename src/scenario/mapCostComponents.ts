import type { SourceTrace } from '../domain/common.js';
import type { ScenarioDatasets } from './datasets.js';
import type { NormalizedScenario } from './types.js';
import type { RouteSelection } from './selectRoute.js';
import { unique } from './util.js';

export interface CostComponentResult {
  cost_components: string[];
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

  return { cost_components: unique(components), source_trace: traces };
}
