import type { LocationType } from '../domain/itinerary.js';
import type {
  ScenarioDatasets,
  PickupContextData,
  DropoffContextData
} from './datasets.js';
import type {
  NestedEndpointInput,
  NormalizedEndpoint,
  NormalizedScenario,
  RawScenarioInput
} from './types.js';
import { coerceLocationType, dedupeSourceTrace, locationTokens, parseTimeToMinutes } from './util.js';
import type { SourceTrace } from '../domain/common.js';

const DESTINATION_ALIASES: Record<string, string> = {
  bromo: 'bromo',
  'mount bromo': 'bromo',
  'mt bromo': 'bromo',
  ijen: 'ijen',
  'kawah ijen': 'ijen',
  'mount ijen': 'ijen',
  madakaripura: 'madakaripura',
  'madakaripura waterfall': 'madakaripura',
  'tumpak sewu': 'tumpak_sewu',
  tumpaksewu: 'tumpak_sewu',
  papuma: 'papuma',
  'tanjung papuma': 'papuma',
  malang: 'malang_batu',
  batu: 'malang_batu',
  'malang batu': 'malang_batu',
  surabaya: 'surabaya_city',
  'surabaya city': 'surabaya_city',
  bali: 'bali_ketapang',
  ketapang: 'bali_ketapang',
  gilimanuk: 'bali_ketapang'
};

/** Map a raw destination name (any case / spacing) to its canonical id. */
export function canonicalDestination(raw: string): string {
  const spaced = raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (DESTINATION_ALIASES[spaced]) return DESTINATION_ALIASES[spaced];
  const underscored = spaced.replace(/\s+/g, '_');
  return DESTINATION_ALIASES[underscored] ?? underscored;
}

interface ContextLike {
  id: string;
  label: string;
  type: string;
  location_group: string;
  connects_to?: string[];
}

/**
 * Generic type words that appear in many context ids (e.g. "hotel", "airport") and must NOT, on
 * their own, resolve a context — otherwise "Bali Hotel" would match `surabaya_hotel_pickup`.
 */
const GENERIC_LOCATION_WORDS = new Set([
  'airport',
  'hotel',
  'harbor',
  'harbour',
  'port',
  'ferry',
  'station',
  'train',
  'city',
  'point',
  'custom',
  'address',
  'area',
  'dropoff',
  'pickup',
  'terminal'
]);

/** Place-specific tokens only — generic type words are stripped before id/connects matching. */
function placeTokens(location: string): string[] {
  return locationTokens(location).filter((token) => !GENERIC_LOCATION_WORDS.has(token));
}

/** Score a context: `place` reflects a real location match; `type` is a weak tie-breaker only. */
function scoreContext(context: ContextLike, type: LocationType, location: string): { place: number; type: number } {
  const tokens = placeTokens(location);
  const loc = location.toLowerCase();
  const id = context.id.toLowerCase();
  let place = 0;
  if (tokens.some((token) => id.includes(token))) place += 3;
  if (context.location_group && loc.includes(context.location_group.toLowerCase())) place += 2;
  if (context.connects_to?.some((c) => tokens.some((token) => c.toLowerCase().includes(token)))) place += 2;
  return { place, type: context.type === type ? 1 : 0 };
}

/**
 * Resolve a travel context only when there is a real place signal. A type-only match (e.g. the bare
 * word "hotel") is insufficient and returns null, so the caller flags the endpoint for manual review.
 */
function resolveContext<T extends ContextLike>(contexts: T[], type: LocationType, location: string): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const context of contexts) {
    const { place, type: typeScore } = scoreContext(context, type, location);
    if (place <= 0) continue;
    const score = place * 10 + typeScore;
    if (score > bestScore) {
      best = context;
      bestScore = score;
    }
  }
  return best;
}

function readEndpoint(
  raw: RawScenarioInput,
  role: 'pickup' | 'dropoff'
): { type: LocationType; location: string; time: string | null; deadline: string | null } {
  const nested: NestedEndpointInput | undefined = raw[role];
  if (role === 'pickup') {
    return {
      type: coerceLocationType(nested?.type ?? raw.pickup_type),
      location: String(nested?.location ?? raw.pickup_location ?? '').trim(),
      time: (nested?.time as string | undefined) ?? raw.pickup_time ?? raw.arrival_time ?? null,
      deadline: null
    };
  }
  return {
    type: coerceLocationType(nested?.type ?? raw.dropoff_type),
    location: String(nested?.location ?? raw.dropoff_location ?? '').trim(),
    time: null,
    deadline: (nested?.deadline_time as string | undefined) ?? raw.dropoff_deadline ?? null
  };
}

function normalizePickup(raw: RawScenarioInput, contexts: PickupContextData[]): NormalizedEndpoint {
  const { type, location, time } = readEndpoint(raw, 'pickup');
  const context = resolveContext(contexts, type, location);
  const parsed = parseTimeToMinutes(time);
  const buffer = context?.default_ready_buffer_minutes ?? null;
  const derived = parsed && buffer != null ? parsed.minutes + buffer : null;
  const required = context?.required_customer_fields ?? [];
  const missing = required.filter((field) => {
    if (field === 'arrival_time') return parsed == null;
    return true; // flight_number / origin_city etc. are not collected in this PII-free core
  });
  return {
    role: 'pickup',
    type,
    location,
    context_id: context?.id ?? null,
    context_label: context?.label ?? null,
    time_hhmm: parsed?.hhmm ?? null,
    time_minutes: parsed?.minutes ?? null,
    default_buffer_minutes: buffer,
    derived_minutes: derived,
    missing_required_fields: missing,
    needs_manual_geocoding: type === 'custom_address' || context == null
  };
}

function normalizeDropoff(raw: RawScenarioInput, contexts: DropoffContextData[]): NormalizedEndpoint {
  const { type, location, deadline } = readEndpoint(raw, 'dropoff');
  const context = resolveContext(contexts, type, location);
  const parsed = parseTimeToMinutes(deadline);
  const buffer = context?.default_buffer_minutes ?? null;
  const derived = parsed && buffer != null ? parsed.minutes - buffer : null;
  const required = context?.required_customer_fields ?? [];
  const missing = required.filter((field) => {
    if (field === 'departure_time' || field === 'train_departure_time' || field === 'deadline_if_any') {
      return parsed == null;
    }
    return true;
  });
  return {
    role: 'dropoff',
    type,
    location,
    context_id: context?.id ?? null,
    context_label: context?.label ?? null,
    time_hhmm: parsed?.hhmm ?? null,
    time_minutes: parsed?.minutes ?? null,
    default_buffer_minutes: buffer,
    derived_minutes: derived,
    missing_required_fields: missing,
    needs_manual_geocoding: type === 'custom_address' || context == null
  };
}

/**
 * Normalize a raw scenario (flat or nested) into the internal NormalizedScenario.
 * Never emits raw customer PII: only travel context ids, place names, and times are retained.
 */
export function normalizeScenarioInput(raw: RawScenarioInput, datasets: ScenarioDatasets): NormalizedScenario {
  const pickup = normalizePickup(raw, datasets.pickupContexts);
  const dropoff = normalizeDropoff(raw, datasets.dropoffContexts);

  const rawDestinations = raw.requested_destinations ?? raw.destinations ?? [];
  const destinations = [...new Set(rawDestinations.map(canonicalDestination))];

  const parsedArrival = parseTimeToMinutes(raw.arrival_time ?? (raw.pickup?.time as string | undefined) ?? raw.pickup_time);

  const missing = [...new Set([...pickup.missing_required_fields, ...dropoff.missing_required_fields])];

  const traces: SourceTrace[] = [];
  const pickupContext = datasets.pickupContexts.find((c) => c.id === pickup.context_id);
  const dropoffContext = datasets.dropoffContexts.find((c) => c.id === dropoff.context_id);
  if (pickupContext) traces.push(...pickupContext.source_trace);
  if (dropoffContext) traces.push(...dropoffContext.source_trace);

  return {
    pickup,
    dropoff,
    pax: Number(raw.pax ?? 0),
    duration_days: Number(raw.duration_days ?? 0),
    destinations,
    arrival_minutes: parsedArrival?.minutes ?? pickup.time_minutes ?? null,
    arrival_hhmm: parsedArrival?.hhmm ?? pickup.time_hhmm ?? null,
    constraints: raw.constraints ?? [],
    missing_required_fields: missing,
    source_trace: dedupeSourceTrace(traces)
  };
}
