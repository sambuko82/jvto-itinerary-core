import type { SourceTrace } from '../domain/common.js';
import type { LocationType } from '../domain/itinerary.js';

/** 17:00 in minutes-since-midnight — the late-arrival threshold from the recommendation rules. */
export const LATE_ARRIVAL_MINUTES = 17 * 60;

/** Standing MVP data gaps surfaced via next_required_info (kept out of risk `warnings`). */
export const MVP_DATA_GAPS: string[] = [
  'distance_km and route polyline are not verified in this MVP',
  'actual vehicle/crew/hotel/activity rates require redacted backoffice export ingestion',
  'flight/ferry/train numbers and origin/next destination are collected outside this PII-free core'
];

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function dedupeSourceTrace(traces: SourceTrace[]): SourceTrace[] {
  const seen = new Set<string>();
  const out: SourceTrace[] = [];
  for (const trace of traces) {
    const key = `${trace.source}|${trace.ref}|${trace.field ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trace);
  }
  return out;
}

const KNOWN_LOCATION_TYPES: ReadonlySet<LocationType> = new Set<LocationType>([
  'airport',
  'hotel',
  'train_station',
  'harbor',
  'city_point',
  'custom_address',
  'bali_area',
  'destination_area'
]);

/** Coerce an arbitrary type string into a known LocationType, defaulting to custom_address. */
export function coerceLocationType(raw: string | undefined): LocationType {
  const value = (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (KNOWN_LOCATION_TYPES.has(value as LocationType)) return value as LocationType;
  if (value === 'harbour' || value === 'port' || value === 'ferry') return 'harbor';
  if (value === 'station') return 'train_station';
  if (value === 'bali' || value === 'bali_hotel') return 'bali_area';
  return 'custom_address';
}

/** Parse "HH:MM" or an ISO-8601 timestamp into minutes-since-midnight. Timezone-agnostic by design. */
export function parseTimeToMinutes(value: string | undefined | null): { hhmm: string; minutes: number } | null {
  if (!value) return null;
  const iso = value.match(/T(\d{2}):(\d{2})/);
  const plain = value.match(/^(\d{1,2}):(\d{2})/);
  const match = iso ?? plain;
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const hhmm = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return { hhmm, minutes: hours * 60 + minutes };
}

/** Significant tokens (length >= 4) used for fuzzy context matching. */
export function locationTokens(location: string): string[] {
  return location
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}
