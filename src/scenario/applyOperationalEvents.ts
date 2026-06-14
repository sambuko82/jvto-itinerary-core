import type { SourceTrace } from '../domain/common.js';
import type { ScenarioDatasets, OperationalEventData } from './datasets.js';
import type { NormalizedScenario } from './types.js';
import type { RouteSelection } from './selectRoute.js';
import { unique } from './util.js';

export interface OperationalEventResult {
  events: string[];
  source_trace: SourceTrace[];
}

/** Granular Ijen events required by issue #2 Rule 3 (expanded beyond the dataset's grouped event). */
const IJEN_GRANULAR_EVENTS = [
  'bondowoso_or_banyuwangi_hotel_checkin',
  'pre_ijen_dinner',
  'ijen_medical_check',
  'ijen_briefing',
  'gas_mask_distribution',
  'midnight_ijen_departure'
];

function eventApplies(event: OperationalEventData, scenario: NormalizedScenario, selection: RouteSelection): boolean {
  const dests = scenario.destinations;
  switch (event.id) {
    case 'bondowoso_dinner_medical_check':
      return dests.includes('ijen');
    case 'bromo_jeep_handoff':
      return dests.includes('bromo');
    case 'waterfall_local_guide_handoff':
      return dests.includes('madakaripura') || dests.includes('tumpak_sewu');
    case 'ketapang_ferry_connection':
      return selection.east_bound_dropoff;
    default:
      return false;
  }
}

/**
 * Resolve required operational events for the scenario from dataset 07,
 * expanding the Ijen preparation into the granular issue #2 Rule 3 events.
 */
export function applyOperationalEvents(
  scenario: NormalizedScenario,
  selection: RouteSelection,
  datasets: ScenarioDatasets
): OperationalEventResult {
  const events: string[] = [];
  const traces: SourceTrace[] = [];

  for (const event of datasets.operationalEvents) {
    if (eventApplies(event, scenario, selection)) {
      events.push(event.id);
      traces.push(...event.source_trace);
    }
  }

  if (scenario.destinations.includes('ijen')) {
    events.push(...IJEN_GRANULAR_EVENTS);
  }

  return { events: unique(events), source_trace: traces };
}
