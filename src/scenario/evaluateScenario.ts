import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { resolveCostId } from '../config/cost-aliases.js';
import type { ItineraryScenario } from '../domain/itinerary.js';
import type { SourceTrace } from '../domain/common.js';

// ─── Output contract (flat, issue-#2 compatible, future-consumable) ───
export interface ScenarioEvaluation {
  status: 'recommended' | 'possible_with_warning' | 'not_recommended' | 'needs_manual_review';
  recommended_route: string[]; // ordered location labels
  route_leg_ids: string[]; // joinable to 04-route-leg-index.json
  package_route_id: string | null; // joinable to 11-package-route-map.json (package_id)
  warnings: string[];
  operational_events: string[]; // joinable to 07-operational-events.json
  meal_logic: string[]; // joinable to 08-meal-logic.json
  accommodation_logic: string[]; // joinable to 09-accommodation-logic.json
  cost_components: string[]; // canonical IDs only, joinable to 10-cost-components.json (NO rates/totals)
  better_route_notes: string[];
  next_required_info: string[];
  source_trace: SourceTrace[];
}

interface Datasets {
  pickups: Array<Record<string, unknown>>;
  dropoffs: Array<Record<string, unknown>>;
  legs: Array<Record<string, unknown>>;
  destinations: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  meals: Array<Record<string, unknown>>;
  accommodations: Array<Record<string, unknown>>;
  costs: Array<Record<string, unknown>>;
  packageRoutes: Array<Record<string, unknown>>;
  rules: Array<Record<string, unknown>>;
}

export async function loadDatasets(dir: string = GENERATED_DIR): Promise<Datasets> {
  const [pickups, dropoffs, legs, destinations, events, meals, accommodations, costs, packageRoutes, rules] =
    await Promise.all([
      readJson<Datasets['pickups']>(`${dir}/01-pickup-contexts.json`),
      readJson<Datasets['dropoffs']>(`${dir}/02-dropoff-contexts.json`),
      readJson<Datasets['legs']>(`${dir}/04-route-leg-index.json`),
      readJson<Datasets['destinations']>(`${dir}/06-destination-activity-profiles.json`),
      readJson<Datasets['events']>(`${dir}/07-operational-events.json`),
      readJson<Datasets['meals']>(`${dir}/08-meal-logic.json`),
      readJson<Datasets['accommodations']>(`${dir}/09-accommodation-logic.json`),
      readJson<Datasets['costs']>(`${dir}/10-cost-components.json`),
      readJson<Datasets['packageRoutes']>(`${dir}/11-package-route-map.json`),
      readJson<Datasets['rules']>(`${dir}/12-recommendation-rules.json`)
    ]);
  return { pickups, dropoffs, legs, destinations, events, meals, accommodations, costs, packageRoutes, rules };
}

// ─── Destination normalization ───
const DEST_ALIASES: Record<string, string> = {
  bromo: 'bromo',
  'mount bromo': 'bromo',
  ijen: 'ijen',
  'kawah ijen': 'ijen',
  madakaripura: 'madakaripura',
  'tumpak sewu': 'tumpak_sewu',
  tumpak_sewu: 'tumpak_sewu',
  papuma: 'papuma',
  malang: 'malang_batu',
  batu: 'malang_batu',
  'malang/batu': 'malang_batu'
};
function normDest(raw: string): string | null {
  return DEST_ALIASES[raw.trim().toLowerCase()] ?? null;
}

// Corridor destinations in west->east geographic order. Madakaripura is a SPUR
// (out-and-back from Bromo), not a corridor node.
const CORRIDOR_WEST_TO_EAST = ['tumpak_sewu', 'bromo', 'ijen'] as const;
const SPUR_BASE: Record<string, string> = { madakaripura: 'bromo' };

// ─── Area-key mapping (labels in the datasets -> routing node keys) ───
function areaKey(label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes('surabaya') && l.includes('airport')) return 'sby_airport';
  if (l.includes('surabaya') && l.includes('hotel')) return 'sby_hotel';
  if (l.includes('surabaya')) return 'sby';
  if (l.includes('bromo')) return 'bromo';
  if (l.includes('madakaripura')) return 'madakaripura';
  if (l.includes('tumpak')) return 'tumpak';
  if (l.includes('bondowoso') || l.includes('ijen') || l.includes('banyuwangi')) return 'ijen_area';
  if (l.includes('ketapang')) return 'ketapang';
  if (l.includes('gilimanuk') || l.includes('bali')) return 'bali';
  if (l.includes('malang')) return 'malang';
  return null;
}

const DEST_NODE: Record<string, { area: string; label: string }> = {
  tumpak_sewu: { area: 'tumpak', label: 'Tumpak Sewu Area' },
  bromo: { area: 'bromo', label: 'Bromo Area' },
  ijen: { area: 'ijen_area', label: 'Bondowoso / Ijen Area' },
  madakaripura: { area: 'madakaripura', label: 'Madakaripura Waterfall' }
};

const REGION = {
  west: new Set(['sby_airport', 'sby_hotel', 'sby', 'malang']),
  east: new Set(['ketapang', 'bali'])
};

// Map a routing area key (from areaKey) back to a corridor/spur destination key.
function areaToDest(area: string | null): string | null {
  switch (area) {
    case 'bromo':
      return 'bromo';
    case 'ijen_area':
      return 'ijen';
    case 'tumpak':
      return 'tumpak_sewu';
    case 'madakaripura':
      return 'madakaripura';
    case 'malang':
      return 'malang_batu';
    default:
      return null;
  }
}

function pickupNode(p: { type?: string; location?: string }): { area: string; label: string } | null {
  const loc = (p.location ?? '').toLowerCase();
  const type = (p.type ?? '').toLowerCase();
  if (loc.includes('bali')) return { area: 'bali', label: 'Bali Hotel Area' };
  if (loc.includes('ketapang') || type === 'harbor') return { area: 'ketapang', label: 'Ketapang Harbor' };
  if (loc.includes('malang')) return { area: 'malang', label: 'Malang' };
  if (type === 'airport') return { area: 'sby_airport', label: 'Surabaya Airport' };
  if (type === 'hotel') return { area: 'sby_hotel', label: 'Surabaya Hotel' };
  if (loc.includes('surabaya')) return { area: 'sby', label: 'Surabaya' };
  return null;
}

function dropoffNodes(d: { type?: string; location?: string }): Array<{ area: string; label: string }> {
  const loc = (d.location ?? '').toLowerCase();
  const type = (d.type ?? '').toLowerCase();
  if (loc.includes('bali') || type === 'bali_area') return [{ area: 'ketapang', label: 'Ketapang Harbor' }, { area: 'bali', label: 'Gilimanuk / Bali side' }];
  if (loc.includes('ketapang') || type === 'harbor') return [{ area: 'ketapang', label: 'Ketapang Harbor' }];
  if (loc.includes('malang')) return [{ area: 'malang', label: 'Malang' }];
  if (loc.includes('surabaya') && type === 'airport') return [{ area: 'sby_airport', label: 'Surabaya Airport' }];
  if (loc.includes('surabaya')) return [{ area: 'sby', label: 'Surabaya' }];
  return [];
}

function parseHHMM(t?: string): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ─── Leg lookup ───
function buildLegLookup(legs: Datasets['legs']): Map<string, string> {
  const map = new Map<string, string>();
  for (const leg of legs) {
    const from = areaKey(String(leg.from_location ?? ''));
    const to = areaKey(String(leg.to_location ?? ''));
    if (!from || !to || from === to) continue; // skip self-loops (e.g. Ijen Area -> Ijen Crater)
    map.set(`${from}->${to}`, String(leg.id));
  }
  return map;
}
function resolveLeg(map: Map<string, string>, from: string, to: string): string | null {
  if (map.has(`${from}->${to}`)) return map.get(`${from}->${to}`)!;
  // fallback: airport/hotel start legs can fall back to generic Surabaya origin
  const genFrom = from === 'sby_airport' || from === 'sby_hotel' ? 'sby' : from;
  if (genFrom !== from && map.has(`${genFrom}->${to}`)) return map.get(`${genFrom}->${to}`)!;
  return null;
}

export function evaluateScenario(scenario: ItineraryScenario, datasets: Datasets): ScenarioEvaluation {
  const warnings: string[] = [];
  const betterRouteNotes: string[] = [];
  const nextRequiredInfo: string[] = [];

  const canonicalCostIds = new Set(datasets.costs.map((c) => String(c.id)));
  const ruleText = (id: string): string => {
    const r = datasets.rules.find((x) => x.id === id);
    return r ? String(r.recommendation ?? id) : id;
  };

  // ── Destinations ──
  const requested = Array.isArray(scenario.requested_destinations) ? scenario.requested_destinations : [];
  const resolvedDests = requested.map(normDest);
  const unknownDest = resolvedDests.some((d) => d === null);
  const dests = new Set(resolvedDests.filter((d): d is string => d !== null));
  const mains = CORRIDOR_WEST_TO_EAST.filter((d) => dests.has(d));
  const spurs = Object.keys(SPUR_BASE).filter((d) => dests.has(d));

  // ── Endpoints ──
  const startNode = pickupNode(scenario.pickup ?? {});
  const endNodes = dropoffNodes(scenario.dropoff ?? {});

  // ── Direction: reverse the corridor if travelling east -> west ──
  const startArea = startNode?.area;
  const endArea = endNodes.length ? endNodes[endNodes.length - 1].area : undefined;
  const reverse = !!(startArea && endArea && REGION.east.has(startArea) && REGION.west.has(endArea));
  const orderedMains = reverse ? [...mains].reverse() : mains;

  // backtracking note: requested order differs from geographic order
  const requestedMainOrder = resolvedDests.filter((d): d is string => !!d && (CORRIDOR_WEST_TO_EAST as readonly string[]).includes(d));
  if (!reverse && requestedMainOrder.join(',') !== orderedMains.join(',') && (endArea === 'ketapang' || endArea === 'bali')) {
    warnings.push(ruleText('avoid_backtracking_ijen_bromo_ketapang'));
    betterRouteNotes.push('Reordered destinations west-to-east (Surabaya -> Bromo -> Ijen -> Ketapang/Bali) to avoid backtracking.');
  }

  // ── Route nodes + legs ──
  const recommendedRoute: string[] = [];
  const routeLegIds: string[] = [];
  const legMap = buildLegLookup(datasets.legs);

  const nodeSeq: Array<{ area: string; label: string }> = [];
  if (startNode) nodeSeq.push(startNode);
  for (const d of orderedMains) nodeSeq.push(DEST_NODE[d]);
  for (const e of endNodes) {
    if (!nodeSeq.length || nodeSeq[nodeSeq.length - 1].area !== e.area) nodeSeq.push(e);
  }

  let unresolvedLeg = false;
  for (let i = 0; i < nodeSeq.length; i++) {
    recommendedRoute.push(nodeSeq[i].label);
    if (i === 0) continue;
    const legId = resolveLeg(legMap, nodeSeq[i - 1].area, nodeSeq[i].area);
    if (legId) routeLegIds.push(legId);
    else {
      betterRouteNotes.push(`No direct route leg defined for ${nodeSeq[i - 1].label} -> ${nodeSeq[i].label} (needs verification).`);
      unresolvedLeg = true;
    }
  }

  // Ijen crater is an in-area activity leg (Bondowoso / Ijen Area -> Ijen Crater).
  // areaKey maps both endpoints to `ijen_area`, so buildLegLookup drops it as a
  // self-loop. Emit it explicitly when the route visits Ijen so the midnight
  // crater drive/risk and ticket/guide costs are not lost from downstream maps
  // and ops. (Package scenarios override route_leg_ids below, so this is scoped
  // to the derived path.)
  if (dests.has('ijen')) {
    const craterLeg = datasets.legs.find((l) => String(l.to_location ?? '').toLowerCase().includes('ijen crater'));
    const ijenNode = nodeSeq.find((n) => n.area === 'ijen_area');
    if (craterLeg && ijenNode) {
      const craterId = String(craterLeg.id);
      const labelIdx = recommendedRoute.indexOf(ijenNode.label);
      if (labelIdx >= 0 && recommendedRoute[labelIdx + 1] !== 'Ijen Crater') {
        recommendedRoute.splice(labelIdx + 1, 0, 'Ijen Crater');
      }
      if (!routeLegIds.includes(craterId)) {
        const arriveIdx = routeLegIds.findIndex((id) => {
          const leg = datasets.legs.find((l) => l.id === id);
          return leg && areaKey(String(leg.to_location ?? '')) === 'ijen_area';
        });
        if (arriveIdx >= 0) routeLegIds.splice(arriveIdx + 1, 0, craterId);
        else routeLegIds.push(craterId);
      }
    }
  }

  // ── Package-aware baseline (11-package-route-map) ──
  // When a package_slug is given, use the package route_sequence/route_legs as
  // the baseline and only flag conflicts with pickup/dropoff/requested dests.
  let packageRouteId: string | null = null;
  if (scenario.package_slug) {
    const pkg = datasets.packageRoutes.find((p) => p.package_id === scenario.package_slug);
    if (!pkg) {
      betterRouteNotes.push(`package_slug "${scenario.package_slug}" not found in 11-package-route-map; using derived route.`);
    } else {
      packageRouteId = String(pkg.package_id);
      const seq = (pkg.route_sequence as string[] | undefined) ?? [];
      const pkgLegs = ((pkg.route_legs as string[] | undefined) ?? []).filter((id) =>
        datasets.legs.some((l) => l.id === id)
      );
      if (seq.length) {
        recommendedRoute.length = 0;
        recommendedRoute.push(...seq);
      }
      if (pkgLegs.length) {
        routeLegIds.length = 0;
        routeLegIds.push(...pkgLegs);
      }
      // conflict: a requested destination is not part of the package route
      const pkgDestKeys = new Set(seq.map((s) => areaToDest(areaKey(s))).filter((d): d is string => !!d));
      for (const d of dests) {
        if (!pkgDestKeys.has(d)) {
          warnings.push(
            `Requested destination "${d}" is not part of package route "${packageRouteId}"; package route may need adjustment.`
          );
        }
      }
      // conflict: requested dropoff differs from where the package route ends
      const pkgEndArea = seq.length ? areaKey(seq[seq.length - 1]) : null;
      if (pkgEndArea && endArea && pkgEndArea !== endArea && !(REGION.east.has(pkgEndArea) && REGION.east.has(endArea))) {
        warnings.push(
          `Package route "${packageRouteId}" ends at "${seq[seq.length - 1]}" but requested dropoff resolves to "${endArea}"; confirm dropoff handling.`
        );
      }
    }
  }

  // ── Spur legs (e.g. Madakaripura out-and-back from Bromo) ──
  const traversedLegIds = [...routeLegIds];
  for (const spur of spurs) {
    const base = SPUR_BASE[spur];
    const baseArea = DEST_NODE[base]?.area;
    const spurArea = DEST_NODE[spur]?.area;
    const legId = baseArea && spurArea ? resolveLeg(legMap, baseArea, spurArea) : null;
    if (legId) {
      traversedLegIds.push(legId);
      // insert into the displayed route right after the base label
      const baseLabel = DEST_NODE[base]?.label;
      const idx = recommendedRoute.indexOf(baseLabel);
      if (idx >= 0) recommendedRoute.splice(idx + 1, 0, DEST_NODE[spur].label);
      // insert leg id right after the leg that arrives at the base area
      const arriveIdx = routeLegIds.findIndex((id) => {
        const leg = datasets.legs.find((l) => l.id === id);
        return leg && areaKey(String(leg.to_location ?? '')) === baseArea;
      });
      if (arriveIdx >= 0) routeLegIds.splice(arriveIdx + 1, 0, legId);
      else routeLegIds.push(legId);
    } else {
      betterRouteNotes.push(`No route leg defined for ${base} -> ${spur} spur (needs verification).`);
      unresolvedLeg = true;
    }
  }

  // ── Operational events (07) by applicability ──
  const operationalEvents: string[] = [];
  // A Ketapang Harbor endpoint only continues to Bali when the customer has
  // actually chosen a Bali continuation (dropoff.next_destination / transfer
  // preference). Ketapang-only dropoffs must NOT pull in the ferry connection
  // event and its ferry_ticket / Bali-transfer cost tags.
  const dropoffExtra = scenario.dropoff as unknown as Record<string, unknown> | undefined;
  const nextDestination = String(dropoffExtra?.next_destination ?? '').toLowerCase();
  const ketapangContinuesToBali =
    endArea === 'ketapang' &&
    (nextDestination.includes('bali') ||
      nextDestination.includes('gilimanuk') ||
      dropoffExtra?.ferry_or_bali_transfer_preference != null);
  const continuesToBali = endArea === 'bali' || ketapangContinuesToBali;
  const eventApplicable: Record<string, boolean> = {
    bromo_jeep_handoff: dests.has('bromo'),
    waterfall_local_guide_handoff: dests.has('madakaripura') || dests.has('tumpak_sewu'),
    bondowoso_dinner_medical_check: dests.has('ijen'),
    ketapang_ferry_connection: continuesToBali
  };
  for (const ev of datasets.events) {
    if (eventApplicable[String(ev.id)]) operationalEvents.push(String(ev.id));
  }

  // ── Meal logic (08) by applicability ──
  const longTransfer = routeLegIds.length >= 3 || mains.length >= 2;
  const mealApplicable: Record<string, boolean> = {
    dinner_before_ijen: dests.has('ijen'),
    takeaway_breakfast_after_ijen_or_bromo: dests.has('ijen') || dests.has('bromo'),
    lunch_stop_own_expense_long_transfer: longTransfer
  };
  const meal_logic = datasets.meals
    .filter((m) => mealApplicable[String(m.id)])
    .map((m) => String(m.id));

  // ── Accommodation logic (09) by applicability ──
  const baliOrigin = startArea === 'bali';
  const accApplicable: Record<string, boolean> = {
    bromo_area_sunrise_staging: dests.has('bromo'),
    bondowoso_ijen_staging: dests.has('ijen') && !baliOrigin,
    banyuwangi_staging: dests.has('ijen') && baliOrigin,
    tumpak_sewu_staging: dests.has('tumpak_sewu'),
    papuma_staging: dests.has('papuma'),
    malang_batu_staging: dests.has('malang_batu') || endArea === 'malang'
  };
  const accommodation_logic = datasets.accommodations
    .filter((a) => accApplicable[String(a.area_id)])
    .map((a) => String(a.id));

  // ── Cost components: gather raw tags, resolve to canonical 10 IDs ──
  const rawCostTags = new Set<string>();
  for (const id of traversedLegIds) {
    const leg = datasets.legs.find((l) => l.id === id);
    for (const t of (leg?.cost_impacts as string[] | undefined) ?? []) rawCostTags.add(t);
  }
  for (const d of dests) {
    const prof = datasets.destinations.find((x) => x.destination_id === d);
    for (const t of (prof?.cost_components as string[] | undefined) ?? []) rawCostTags.add(t);
  }
  for (const evId of operationalEvents) {
    const ev = datasets.events.find((x) => x.id === evId);
    for (const t of (ev?.cost_components as string[] | undefined) ?? []) {
      // The generic `waterfall_local_guide` event tag aliases to the Madakaripura
      // guide. Resolve it from the waterfall actually requested so Tumpak-Sewu-only
      // scenarios don't emit a Madakaripura guide cost.
      if (t === 'waterfall_local_guide') {
        if (dests.has('madakaripura')) rawCostTags.add('madakaripura_local_guide');
        if (dests.has('tumpak_sewu')) rawCostTags.add('tumpak_sewu_local_guide');
      } else {
        rawCostTags.add(t);
      }
    }
  }
  const costComponents: string[] = [];
  for (const tag of rawCostTags) {
    const id = resolveCostId(tag, canonicalCostIds);
    if (id && !costComponents.includes(id)) costComponents.push(id);
  }
  costComponents.sort();

  // ── Time / feasibility ──
  const arrival = parseHHMM(scenario.arrival_time ?? scenario.pickup?.time);
  const lateAirport = (scenario.pickup?.type ?? '').toLowerCase() === 'airport' && arrival !== null && arrival >= 17 * 60;
  if (lateAirport && (dests.has('bromo') || dests.has('ijen'))) {
    warnings.push(ruleText('late_airport_arrival_requires_rest_warning'));
  }

  // waterfall before tight airport dropoff
  const lastMain = orderedMains[orderedMains.length - 1];
  const endsAtWaterfall = spurs.length > 0 && (endArea === 'sby_airport') && (lastMain === 'bromo');
  if ((endArea === 'sby_airport') && (dests.has('tumpak_sewu') || dests.has('madakaripura')) && endsAtWaterfall) {
    warnings.push(ruleText('waterfall_before_airport_deadline_risk'));
  }

  // ── next_required_info from pickup/dropoff contexts ──
  const pickupCtx = datasets.pickups.find((p) => p.type === scenario.pickup?.type);
  const dropoffCtx = datasets.dropoffs.find((d) => d.type === scenario.dropoff?.type);
  const provided = (obj: Record<string, unknown> | undefined) => new Set(Object.keys(obj ?? {}));
  const pickupObj = scenario.pickup as unknown as Record<string, unknown> | undefined;
  const dropoffObj = scenario.dropoff as unknown as Record<string, unknown> | undefined;
  const pProvided = provided(pickupObj);
  const dProvided = provided(dropoffObj);
  for (const f of (pickupCtx?.required_customer_fields as string[] | undefined) ?? []) {
    const val = pickupObj?.[f];
    if (!pProvided.has(f) || val === 'TBD' || val === '' || val === undefined) nextRequiredInfo.push(`pickup: ${f}`);
  }
  for (const f of (dropoffCtx?.required_customer_fields as string[] | undefined) ?? []) {
    const val = dropoffObj?.[f];
    if (!dProvided.has(f) || val === 'TBD' || val === '' || val === undefined) nextRequiredInfo.push(`dropoff: ${f}`);
  }

  // bali ferry buffer note (informational, not a blocking warning)
  if (endArea === 'bali' || endArea === 'ketapang') {
    betterRouteNotes.push('Ketapang dropoff/Bali continuation needs a ferry queue buffer; confirm ferry-or-Bali-transfer preference.');
  }

  // ── min-days feasibility ──
  const minDays = (dests.has('ijen') ? 2 : dests.has('bromo') ? 1 : 1) + (dests.has('madakaripura') && dests.has('ijen') ? 1 : 0) + (dests.has('tumpak_sewu') ? 1 : 0);
  const days = typeof scenario.duration_days === 'number' ? scenario.duration_days : 0;
  const tooShort = days < minDays;
  const impossibleOvernight = days <= 1 && (mains.length >= 2 || dests.has('ijen'));

  // ── Status decision ──
  let status: ScenarioEvaluation['status'];
  if (!startNode || endNodes.length === 0 || unknownDest || mains.length === 0) {
    status = 'needs_manual_review';
    if (unknownDest) betterRouteNotes.push('One or more requested destinations are not in the dataset; manual review required.');
    if (!startNode) betterRouteNotes.push('Pickup location could not be normalized; manual review required.');
    if (endNodes.length === 0) betterRouteNotes.push('Dropoff location could not be normalized; manual review required.');
  } else if (tooShort || impossibleOvernight) {
    status = 'not_recommended';
    betterRouteNotes.push(`Requested ${days} day(s) is below the ~${minDays}-day minimum for destinations [${[...dests].join(', ')}]. Add nights or remove a destination.`);
  } else if (unresolvedLeg && !packageRouteId) {
    // A derived route with undefined transfer legs cannot be costed or mapped
    // reliably (the missing legs also drop out of cost output), so it must not
    // be auto-recommended. Package routes carry their own verified leg list.
    status = 'needs_manual_review';
    betterRouteNotes.push('One or more transfer legs between requested stops are undefined (e.g. a reverse-direction leg); manual review required before this route can be recommended.');
  } else if (warnings.length > 0) {
    status = 'possible_with_warning';
  } else {
    status = 'recommended';
  }

  // ── source_trace ──
  const source_trace: SourceTrace[] = [
    { source: 'generated', ref: 'generated/itinerary-intelligence/04-route-leg-index.json', confidence: 'inferred' },
    { source: 'generated', ref: 'generated/itinerary-intelligence/06-destination-activity-profiles.json', confidence: 'inferred' },
    { source: 'generated', ref: 'generated/itinerary-intelligence/07-operational-events.json', confidence: 'inferred' },
    { source: 'generated', ref: 'generated/itinerary-intelligence/08-meal-logic.json', confidence: 'inferred' },
    { source: 'generated', ref: 'generated/itinerary-intelligence/09-accommodation-logic.json', confidence: 'inferred' },
    { source: 'generated', ref: 'generated/itinerary-intelligence/10-cost-components.json', confidence: 'inferred' },
    { source: 'generated', ref: 'generated/itinerary-intelligence/11-package-route-map.json', confidence: 'inferred' },
    { source: 'generated', ref: 'generated/itinerary-intelligence/12-recommendation-rules.json', confidence: 'inferred' }
  ];

  return {
    status,
    recommended_route: recommendedRoute,
    route_leg_ids: routeLegIds,
    package_route_id: packageRouteId,
    warnings,
    operational_events: operationalEvents,
    meal_logic,
    accommodation_logic,
    cost_components: costComponents,
    better_route_notes: betterRouteNotes,
    next_required_info: nextRequiredInfo,
    source_trace
  };
}

// Convenience: load datasets and evaluate in one call.
export async function evaluateScenarioFromFile(scenario: ItineraryScenario, dir?: string): Promise<ScenarioEvaluation> {
  const datasets = await loadDatasets(dir);
  return evaluateScenario(scenario, datasets);
}
