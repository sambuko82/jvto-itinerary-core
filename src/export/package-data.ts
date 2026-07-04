import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import type { SourceTrace } from '../domain/common.js';

/**
 * Shared per-package data loader for the whatsapp-payload and pdf-payload
 * generators (src/export/whatsapp-payload.ts, src/export/pdf-payload.ts).
 *
 * The authoritative package list (16 packages) is
 * `agent-contract/standard-route-truth.json` `packages[]`, cross-referenced
 * with `agent-contract/package-customization-boundaries.json` for instant-book
 * fields. `16-package-pricing.json` actually has 17 entries: it contains an
 * orphan Surabaya-origin `bromo-ijen-3d2n` package that has NO matching
 * standard-route-truth / package-customization-boundaries entry (only the
 * Bali-origin `bali/bromo-ijen-3d2n` is modeled at the agent-contract layer).
 * Since agent-contract is the authoritative source for route/advisory/
 * instant-book data (per task brief), this loader walks the 16 agent-contract
 * packages and looks up pricing by key, rather than walking pricing's 17. The
 * orphan pricing entry is intentionally left unconsumed — see PR body for the
 * suggested follow-up (add the missing route-truth entry upstream).
 */

export interface PriceBand {
  min_pax: number;
  max_pax: number | null;
  idr_per_person: number;
}

export interface PriceContext {
  currency: 'IDR';
  origin: string;
  ferry_included: boolean;
  bands: PriceBand[];
}

export interface ItinerarySegment {
  time_window: string;
  activity: string;
  location: string;
  notes: string;
}

export interface ItineraryDay {
  day: number;
  segments: ItinerarySegment[];
}

interface RouteTruthValueField<T> {
  value: T;
  classification?: string;
  route_integrity?: string;
  evidence?: string[];
}

interface RouteTruthDestination {
  destination: string;
  activity_window: RouteTruthValueField<Record<string, string>>;
  fatigue_score: RouteTruthValueField<number>;
  difficulty_level: RouteTruthValueField<string>;
  live_dependencies?: RouteTruthValueField<string[]>;
  weather_advisory: {
    value: string;
    risk_factors?: Array<{ type: string; level: string; description: string; mitigation: string | null }>;
  };
}

interface RouteTruthLeg {
  leg_ref: string;
  from: string;
  to: string;
  duration_minutes: RouteTruthValueField<number>;
  distance_km: RouteTruthValueField<number>;
}

interface RouteTruthStaging {
  staging_ref: string;
  label: string;
  purpose: string;
  operational_notes: string[];
  risk_if_arrival_late: string[];
}

interface RouteTruthPackage {
  package_key: string;
  origin: string;
  duration: string;
  route_sequence: RouteTruthValueField<string[]>;
  valid_pickups: Array<{ label: string }>;
  valid_dropoffs: Array<{ option: string }>;
  route_legs: RouteTruthLeg[];
  destinations: RouteTruthDestination[];
  staging: RouteTruthStaging[];
}

interface StandardRouteTruthFile {
  packages: RouteTruthPackage[];
}

interface PricingPaxTier {
  min_pax: number;
  max_pax: number | null;
  idr_per_person: number;
}

interface PricingPackage {
  package_id: string;
  origin: string;
  ferry_included: boolean;
  currency: string;
  pax_tiers: PricingPaxTier[];
}

interface PricingFile {
  packages: PricingPackage[];
}

interface CustomizationBoundary {
  package_key: string;
  effective_instant_book_eligible: boolean;
  instant_book_gated_reason: string | null;
}

interface DestinationMasterEntry {
  id: number;
  name: string;
  main_attractions: string | null;
}

interface DestinationsMasterFile {
  destinations: DestinationMasterEntry[];
}

/** route_sequence node name (lowercased) -> canonical destination coreId used by standard-route-truth's `destinations[].destination`. */
const NODE_TO_CORE_ID: Record<string, string> = {
  bromo: 'bromo',
  ijen: 'ijen',
  madakaripura: 'madakaripura',
  'tumpak sewu': 'tumpak_sewu',
  papuma: 'papuma',
  malang: 'malang_batu'
};

/** coreId -> 22-destinations-master.json `name` field (that file uses its own display names, not the crosswalk's). */
const CORE_ID_TO_MASTER_NAME: Record<string, string> = {
  bromo: 'Mount Bromo',
  ijen: 'Mount Ijen',
  madakaripura: 'Madakaripura Waterfall',
  tumpak_sewu: 'Tumpak Sewu Waterfall',
  papuma: 'Papuma Beach',
  malang_batu: 'Malang City'
};

export interface PackageBundle {
  package_id: string;
  display_name: string;
  duration: string;
  origin: string;
  nodes: string[];
  price: PriceContext;
  instant_book_eligible: boolean;
  gated_reason: string | null;
  includesBromo: boolean;
  includesIjen: boolean;
  includesMadakaripura: boolean;
  /** Where the Ijen pre-trek health screening/staging happens for this package,
   * derived from its own staging record — Surabaya-origin packages stage at
   * Bondowoso, Bali-origin ones at Banyuwangi. null when includesIjen is false. */
  ijenStagingLocation: 'Bondowoso' | 'Banyuwangi' | null;
  highlights: string[];
  itinerary_days: ItineraryDay[];
  valid_pickup_labels: string[];
  valid_dropoff_options: string[];
}

function parseDurationDays(duration: string): number {
  const match = /^(\d+)D(\d+)N$/i.exec(duration.trim());
  if (!match) throw new Error(`Cannot parse package duration "${duration}"`);
  return Number(match[1]);
}

function pricingIdForPackageKey(packageKey: string): string {
  return packageKey.startsWith('bali/') ? `${packageKey.slice('bali/'.length)}-bali` : packageKey;
}

function findMasterEntry(
  nodeName: string,
  coreId: string | null,
  master: DestinationMasterEntry[]
): DestinationMasterEntry | null {
  const wantName = coreId ? CORE_ID_TO_MASTER_NAME[coreId] : null;
  if (wantName) {
    const hit = master.find((e) => e.name === wantName);
    if (hit) return hit;
  }
  const lower = nodeName.trim().toLowerCase();
  return (
    master.find((e) => e.name.toLowerCase() === lower) ??
    master.find((e) => e.name.toLowerCase().includes(lower)) ??
    null
  );
}

function firstAttraction(entry: DestinationMasterEntry | null): string | null {
  if (!entry?.main_attractions) return null;
  const [first] = entry.main_attractions.split(',');
  return first?.trim() || null;
}

function displayName(pkg: RouteTruthPackage): string {
  const stops = pkg.route_sequence.value.slice(1);
  const originLabel = pkg.route_sequence.value[0] ?? pkg.origin;
  const stopsLabel = stops.length > 0 ? stops.join(', ') : originLabel;
  return `${stopsLabel} Tour — ${originLabel} Origin`;
}

/** Assigns each non-origin route node to a 0-based day index within [0, dayCount-1].
 * Heuristic: the last `stops.length` days each get exactly one stop, in route
 * order; any earlier days are lead-in transfer/staging days with no
 * standalone destination activity of their own (day 1 of a Bali-origin or
 * long-transfer package, for example). This matches every one of the 16
 * current packages (stops.length is always <= dayCount), verified against
 * `agent-contract/standard-route-truth.json` at authoring time. */
function dayIndexForStop(stopIndex: number, stopCount: number, dayCount: number): number {
  const idx = dayCount - stopCount + stopIndex;
  return Math.min(Math.max(idx, 0), dayCount - 1);
}

/** The day a stop's transfer-in and evening staging land on. Normally the same
 * day as the stop's main activity, EXCEPT when there's a genuinely free
 * lead-in day immediately before it (not already the previous stop's own
 * activity day) — e.g. bromo-2d1n (2 days, 1 stop): the transfer + evening
 * staging belong on day 1 (arrival), with the sunrise activity on day 2, not
 * both crammed onto day 2 alongside a "02:30 jeep pickup" that would then
 * follow a same-day daytime transfer. Verified: across all 16 packages,
 * dayCount - stopCount is always 0 or 1, so shifting back by at most one day
 * is sufficient — this does not attempt to solve a multi-day gap. */
function entryDayIndexForStop(stopIndex: number, stopDayIndex: number[]): number {
  const activityDay = stopDayIndex[stopIndex];
  const previousOccupiedDay = stopIndex === 0 ? -1 : stopDayIndex[stopIndex - 1];
  return activityDay - 1 > previousOccupiedDay ? activityDay - 1 : activityDay;
}

function buildItineraryDays(pkg: RouteTruthPackage, dayCount: number): ItineraryDay[] {
  const nodes = pkg.route_sequence.value;
  const stops = nodes.slice(1);
  const destByCoreId = new Map(pkg.destinations.map((d) => [d.destination, d]));
  const legByPair = new Map(pkg.route_legs.map((l) => [`${l.from}->${l.to}`, l]));
  const stagingByKeyword = pkg.staging;

  const stopDayIndex = stops.map((_, i) => dayIndexForStop(i, stops.length, dayCount));
  const entryDayIndex = stops.map((_, i) => entryDayIndexForStop(i, stopDayIndex));

  const days: ItineraryDay[] = Array.from({ length: dayCount }, (_, i) => ({ day: i + 1, segments: [] }));

  // Day 1 always opens with pickup from the origin.
  days[0].segments.push({
    time_window: 'Per guest flight/arrival time',
    activity: 'Pickup',
    location: nodes[0],
    notes: `Pickup options: ${pkg.valid_pickups.map((p) => p.label).join('; ')}`
  });

  for (let i = 0; i < stops.length; i++) {
    const stopName = stops[i];
    const fromName = nodes[i]; // previous node (origin for i===0)
    const dIdx = stopDayIndex[i];
    const eIdx = entryDayIndex[i];
    const coreId = NODE_TO_CORE_ID[stopName.trim().toLowerCase()] ?? null;
    const dest = coreId ? destByCoreId.get(coreId) : undefined;

    // Transfer leg into this stop, attached to its entry day (the day before
    // the activity day when a free lead-in day exists, otherwise the same day).
    const leg = legByPair.get(`${fromName}->${stopName}`);
    if (leg) {
      days[eIdx].segments.push({
        time_window: 'Daytime transfer (per operational schedule)',
        activity: `Transfer: ${fromName} → ${stopName}`,
        location: `${fromName} → ${stopName}`,
        notes: `Approx. ${leg.distance_km.value} km / ${leg.duration_minutes.value} min drive (source-backed estimate).`
      });
    }

    // Staging/preparation notes (health screening, cold-weather prep, etc.)
    // matched to this stop by keyword against the package's own staging list.
    // Attached to the entry day (evening-before), same reasoning as the transfer.
    const keyword = stopName.trim().toLowerCase();
    const staging = stagingByKeyword.find(
      (s) =>
        s.purpose.toLowerCase().includes(keyword) ||
        s.staging_ref.toLowerCase().includes(keyword) ||
        s.operational_notes.some((n) => n.toLowerCase().includes(keyword)) ||
        (keyword === 'ijen' && (s.staging_ref.includes('banyuwangi') || s.operational_notes.some((n) => n.toLowerCase().includes('ijen'))))
    );
    if (staging) {
      const notes: string[] = [...staging.operational_notes];
      // Derive the screening hotel from the staging record that actually matched
      // this package, not a hardcoded location: Surabaya-origin Ijen packages
      // stage at bondowoso_ijen_staging, Bali-origin ones at banyuwangi_staging.
      if (keyword === 'ijen') {
        const screeningLocation = staging.staging_ref.includes('banyuwangi') ? 'Banyuwangi hotel' : 'Bondowoso hotel';
        notes.push(`Health screening is mandatory at the ${screeningLocation} before the trek.`);
      }
      days[eIdx].segments.push({
        time_window: 'Evening / pre-activity staging',
        activity: `Staging: ${staging.label}`,
        location: stopName,
        notes: notes.join('; ')
      });
    }

    // Main activity, one segment per activity_window time key (authored in
    // chronological order in the source data).
    if (dest) {
      const activityEntries = Object.entries(dest.activity_window.value);
      activityEntries.forEach(([key, timeRange], entryIdx) => {
        const label = key.replace(/_/g, ' ');
        let notes = dest.weather_advisory.risk_factors?.[0]?.mitigation ?? '';
        // The temperature/gear callouts only need to appear once per
        // destination (on its first activity segment) rather than repeated
        // on every time-of-day segment.
        if (entryIdx === 0) {
          if (keyword === 'bromo') notes = `Bromo mornings are cold: 5-15°C at the viewpoint. ${notes}`.trim();
          if (keyword === 'ijen') {
            notes = `Ijen crater area: 10-15°C overnight/pre-dawn. Gas masks provided and sterilized. Blue fire is weather-dependent, not guaranteed. ${notes}`.trim();
          }
        }
        days[dIdx].segments.push({
          time_window: timeRange,
          activity: label.charAt(0).toUpperCase() + label.slice(1),
          location: stopName,
          notes
        });
      });
    } else {
      // No structured activity_window available (e.g. Taman Safari Prigen).
      days[dIdx].segments.push({
        time_window: 'Full day',
        activity: `${stopName} visit`,
        location: stopName,
        notes: 'Program per standard operator itinerary.'
      });
    }
  }

  // Final day closes with dropoff.
  const lastDay = days[dayCount - 1];
  lastDay.segments.push({
    time_window: 'After final activity',
    activity: 'Guest drop-off',
    location: pkg.valid_dropoffs.map((d) => d.option).join(' / '),
    notes: 'Guest selects preferred drop-off point at booking.'
  });

  return days;
}

export async function loadPackageBundles(): Promise<PackageBundle[]> {
  const [routeTruth, pricing, boundaries, master] = await Promise.all([
    readJson<StandardRouteTruthFile>(`${GENERATED_DIR}/agent-contract/standard-route-truth.json`),
    readJson<PricingFile>(`${GENERATED_DIR}/16-package-pricing.json`),
    readJson<CustomizationBoundary[]>(`${GENERATED_DIR}/agent-contract/package-customization-boundaries.json`),
    readJson<DestinationsMasterFile>(`${GENERATED_DIR}/22-destinations-master.json`)
  ]);

  const pricingById = new Map(pricing.packages.map((p) => [p.package_id, p]));
  const boundaryByKey = new Map(boundaries.map((b) => [b.package_key, b]));

  return routeTruth.packages.map((pkg) => {
    const pricingId = pricingIdForPackageKey(pkg.package_key);
    const priceEntry = pricingById.get(pricingId);
    if (!priceEntry) {
      throw new Error(`No 16-package-pricing.json entry for package_key "${pkg.package_key}" (looked up as "${pricingId}")`);
    }
    const boundary = boundaryByKey.get(pkg.package_key);
    if (!boundary) {
      throw new Error(`No package-customization-boundaries.json entry for package_key "${pkg.package_key}"`);
    }

    const nodes = pkg.route_sequence.value;
    const nodesLower = nodes.map((n) => n.toLowerCase());
    const includesBromo = nodesLower.includes('bromo');
    const includesIjen = nodesLower.includes('ijen');
    const includesMadakaripura = nodesLower.includes('madakaripura');
    // Same staging-record lookup buildItineraryDays uses for the Ijen segment note,
    // computed once here so mandatory notes / inclusions never hardcode a location.
    const ijenStaging = includesIjen
      ? pkg.staging.find((s) => s.staging_ref.includes('banyuwangi') || s.staging_ref.includes('bondowoso'))
      : undefined;
    const ijenStagingLocation: PackageBundle['ijenStagingLocation'] = ijenStaging
      ? ijenStaging.staging_ref.includes('banyuwangi')
        ? 'Banyuwangi'
        : 'Bondowoso'
      : null;

    const highlights: string[] = [];
    for (const stop of nodes.slice(1)) {
      const coreId = NODE_TO_CORE_ID[stop.trim().toLowerCase()] ?? null;
      const entry = findMasterEntry(stop, coreId, master.destinations);
      const attraction = firstAttraction(entry);
      if (attraction && !highlights.includes(attraction)) highlights.push(attraction);
      if (highlights.length >= 5) break;
    }

    const dayCount = parseDurationDays(pkg.duration);

    return {
      package_id: pkg.package_key,
      display_name: displayName(pkg),
      duration: pkg.duration,
      origin: pkg.origin,
      nodes,
      price: {
        currency: 'IDR',
        origin: priceEntry.origin,
        ferry_included: priceEntry.ferry_included,
        bands: priceEntry.pax_tiers.map((t) => ({ min_pax: t.min_pax, max_pax: t.max_pax, idr_per_person: t.idr_per_person }))
      },
      instant_book_eligible: boundary.effective_instant_book_eligible,
      gated_reason: boundary.instant_book_gated_reason,
      includesBromo,
      includesIjen,
      includesMadakaripura,
      ijenStagingLocation,
      highlights: highlights.slice(0, 5),
      itinerary_days: buildItineraryDays(pkg, dayCount),
      valid_pickup_labels: pkg.valid_pickups.map((p) => p.label),
      valid_dropoff_options: pkg.valid_dropoffs.map((d) => d.option)
    };
  });
}

export function fileSafePackageId(packageId: string): string {
  return packageId.replace(/\//g, '-');
}

export function buildMandatoryNotes(
  bundle: Pick<PackageBundle, 'includesBromo' | 'includesIjen' | 'ijenStagingLocation'>
): string[] {
  const notes: string[] = [];
  if (bundle.includesBromo) {
    notes.push('Bromo mornings are cold: expect 5-15°C at the crater viewpoint, so pack warm layers.');
  }
  if (bundle.includesIjen) {
    notes.push('Ijen crater area runs 10-15°C overnight and pre-dawn; dress in warm, windproof layers.');
    notes.push('Gas masks for the Ijen sulfur fumes are provided by JVTO and sterilized between uses.');
    // Derived from the package's own staging record, not hardcoded — Bali-origin
    // packages stage/screen at Banyuwangi, not Bondowoso (Codex review, PR #32).
    const stagingHotel = bundle.ijenStagingLocation ?? 'Bondowoso';
    notes.push(`Health screening is mandatory at the ${stagingHotel} hotel before every Ijen trek.`);
    notes.push('Blue fire is a natural, weather-dependent phenomenon at Ijen and cannot be guaranteed on any given night.');
  }
  return notes;
}

/**
 * Current live-condition advisories. `07-operational-events.json` has
 * `madakaripura_access_requirements` / `ijen_access_requirements` entries that
 * establish which packages these advisories apply to (via `applies_when`
 * destination membership, mirrored here by route inclusion), but the file has
 * no live-status/advisory field yet -- the wording below is the current
 * ground-truth operational status supplied for this task and is not itself
 * present in any generated dataset. See PR body for the recommended follow-up
 * (add a `current_status` field upstream so this doesn't drift silently).
 */
export function buildCurrentAdvisories(bundle: Pick<PackageBundle, 'includesMadakaripura' | 'includesIjen'>): string[] {
  const advisories: string[] = [];
  if (bundle.includesMadakaripura) {
    advisories.push('Madakaripura Waterfall is currently inaccessible due to bridge flood damage; this stop is suspended until further notice.');
  }
  if (bundle.includesIjen) {
    advisories.push('The Ijen crater floor (close approach to the blue fire site and lake shore) is currently closed; viewing is from the crater rim only.');
  }
  return advisories;
}

export const CONTACT_EMAIL = 'hello@javavolcano-touroperator.com';
export const DEPOSIT_TERMS = '20%';
export const BANK_OPTIONS = ['BRI', 'BCA'];

export function baseSourceTrace(): SourceTrace[] {
  return [
    { source: 'generated', ref: `${GENERATED_DIR}/16-package-pricing.json`, confidence: 'inferred' },
    { source: 'generated', ref: `${GENERATED_DIR}/agent-contract/standard-route-truth.json`, confidence: 'inferred' },
    { source: 'generated', ref: `${GENERATED_DIR}/agent-contract/package-customization-boundaries.json`, confidence: 'inferred' },
    { source: 'generated', ref: `${GENERATED_DIR}/07-operational-events.json`, confidence: 'inferred' },
    { source: 'generated', ref: `${GENERATED_DIR}/22-destinations-master.json`, confidence: 'inferred' },
    { source: 'generated', ref: `${GENERATED_DIR}/03-time-window-rules.json`, confidence: 'inferred' },
    { source: 'generated', ref: `${GENERATED_DIR}/04-route-leg-index.json`, confidence: 'inferred' },
    { source: 'generated', ref: `${GENERATED_DIR}/10-cost-components.json`, confidence: 'inferred' }
  ];
}
