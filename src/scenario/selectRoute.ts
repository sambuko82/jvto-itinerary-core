import type { SourceTrace } from '../domain/common.js';
import type { ScenarioDatasets, PackageRouteMapData } from './datasets.js';
import type { NormalizedScenario } from './types.js';
import { unique } from './util.js';

export interface RouteSelection {
  recommended_route: string[];
  route_leg_ids: string[];
  matched_package_id: string | null;
  /** True when final dropoff is east-bound (Ketapang/Gilimanuk/Bali). */
  east_bound_dropoff: boolean;
  feasible: boolean;
  infeasible_reasons: string[];
  source_trace: SourceTrace[];
}

/** Canonical west-to-east ordering of destinations within a single overland tour. */
const DESTINATION_ORDER: Record<string, number> = {
  tumpak_sewu: 1,
  bromo: 2,
  madakaripura: 3,
  malang_batu: 4,
  papuma: 5,
  ijen: 6,
  bali_ketapang: 7
};

/** Area-name(s) emitted into recommended_route for each canonical destination id. */
const DESTINATION_AREAS: Record<string, string[]> = {
  tumpak_sewu: ['Tumpak Sewu'],
  bromo: ['Bromo Area'],
  madakaripura: ['Madakaripura'],
  malang_batu: ['Malang / Batu'],
  papuma: ['Papuma'],
  ijen: ['Bondowoso / Ijen Area', 'Ijen Crater']
};

function isEastBound(scenario: NormalizedScenario): boolean {
  const loc = scenario.dropoff.location.toLowerCase();
  if (/ketapang|gilimanuk|bali|pemuteran|lovina|ubud|canggu|seminyak|denpasar/.test(loc)) return true;
  return scenario.dropoff.type === 'bali_area' || scenario.dropoff.type === 'harbor';
}

function startArea(scenario: NormalizedScenario): string {
  const group = scenario.pickup.context_label ?? scenario.pickup.location;
  if (/surabaya/i.test(scenario.pickup.location) || /surabaya/i.test(group)) return 'Surabaya';
  return scenario.pickup.location || 'Pickup';
}

function endArea(scenario: NormalizedScenario, eastBound: boolean): string {
  const loc = scenario.dropoff.location.toLowerCase();
  if (/ketapang/.test(loc)) return 'Ketapang Harbor';
  if (/gilimanuk|bali|pemuteran|lovina|ubud|canggu|seminyak|denpasar/.test(loc)) return 'Bali';
  if (scenario.dropoff.type === 'airport') return scenario.dropoff.location || 'Airport';
  if (eastBound) return 'Ketapang Harbor';
  return scenario.dropoff.location || (scenario.dropoff.context_label ?? 'Dropoff');
}

/** Number of overnights a destination set implies (Bromo sunrise + Ijen midnight trek each need one). */
function requiredDays(destinations: string[]): number {
  let nights = 0;
  if (destinations.includes('bromo')) nights += 1;
  if (destinations.includes('ijen')) nights += 1;
  if (destinations.includes('tumpak_sewu')) nights += 1;
  return Math.max(1, nights + 1);
}

/** True when the pickup is east of Ijen (Bali / Banyuwangi / Ketapang side). */
function isEastPickup(scenario: NormalizedScenario): boolean {
  const loc = scenario.pickup.location.toLowerCase();
  if (/ketapang|gilimanuk|bali|banyuwangi|pemuteran|lovina|ubud|canggu|seminyak|denpasar/.test(loc)) return true;
  return scenario.pickup.type === 'bali_area' || scenario.pickup.type === 'harbor';
}

/** Classify a package origin as east (Bali/Banyuwangi/Ketapang) or west (Surabaya/Malang). */
function packageOriginIsEast(pkg: PackageRouteMapData): boolean {
  return /bali|banyuwangi|ketapang/i.test(pkg.origin);
}

/**
 * Find a package that covers ALL requested destinations and whose origin side matches the pickup.
 * Used only for `matched_package_id` + source_trace — the route itself is synthesized requested-only.
 */
function matchPackage(
  scenario: NormalizedScenario,
  packages: PackageRouteMapData[],
  pickupEast: boolean
): PackageRouteMapData | null {
  for (const pkg of packages) {
    if (packageOriginIsEast(pkg) !== pickupEast) continue;
    const seq = pkg.route_sequence.join(' ').toLowerCase();
    const coversAll = scenario.destinations
      .filter((dest) => DESTINATION_AREAS[dest])
      .every((dest) => (DESTINATION_AREAS[dest] ?? [dest]).some((area) => seq.includes(area.toLowerCase().split(' ')[0])));
    if (coversAll) return pkg;
  }
  return null;
}

function legsForAreas(areas: string[], datasets: ScenarioDatasets): string[] {
  const ids: string[] = [];
  for (let i = 0; i < areas.length - 1; i += 1) {
    const from = areas[i].toLowerCase();
    const to = areas[i + 1].toLowerCase();
    const leg = datasets.routeLegs.find(
      (candidate) =>
        candidate.from_location.toLowerCase().includes(from.split(' ')[0]) &&
        candidate.to_location.toLowerCase().includes(to.split(' ')[0])
    );
    if (leg) ids.push(leg.id);
  }
  return unique(ids);
}

/**
 * Select a recommended route for the scenario.
 * Enforces west-to-east ordering for east-bound dropoffs and flags duration infeasibility.
 */
export function selectRoute(scenario: NormalizedScenario, datasets: ScenarioDatasets): RouteSelection {
  const eastBound = isEastBound(scenario);
  const pickupEast = isEastPickup(scenario);
  // Reverse (east-to-west) when the trip starts east of Ijen and ends west (e.g. Bali -> Surabaya).
  const reverse = pickupEast && !eastBound;
  const traces: SourceTrace[] = [];

  // Order destinations by direction, then expand to area names. Only requested destinations are
  // included — never copy unrequested package stops.
  const orderedDestinations = [...scenario.destinations]
    .filter((dest) => DESTINATION_AREAS[dest])
    .sort((a, b) => (DESTINATION_ORDER[a] ?? 99) - (DESTINATION_ORDER[b] ?? 99));
  if (reverse) orderedDestinations.reverse();

  const destinationAreas = orderedDestinations.flatMap((dest) => DESTINATION_AREAS[dest] ?? []);
  const recommendedRoute = unique([startArea(scenario), ...destinationAreas, endArea(scenario, eastBound)]);
  const routeLegIds = legsForAreas(recommendedRoute, datasets);

  // The package match only contributes metadata + provenance; it never rewrites the route.
  const pkg = matchPackage(scenario, datasets.packageRouteMap, pickupEast);
  const matchedPackageId = pkg?.package_id ?? null;
  if (pkg) traces.push(...pkg.source_trace);

  const need = requiredDays(scenario.destinations);
  const infeasibleReasons: string[] = [];
  if (scenario.duration_days > 0 && scenario.duration_days < need) {
    const labels = orderedDestinations.join(' + ') || 'the requested destinations';
    infeasibleReasons.push(
      `${labels} require at least ${need} days (Bromo sunrise needs an overnight before; Ijen needs an overnight before the midnight trek), but duration_days=${scenario.duration_days}.`
    );
  }

  return {
    recommended_route: recommendedRoute,
    route_leg_ids: routeLegIds,
    matched_package_id: matchedPackageId,
    east_bound_dropoff: eastBound,
    feasible: infeasibleReasons.length === 0,
    infeasible_reasons: infeasibleReasons,
    source_trace: traces
  };
}
