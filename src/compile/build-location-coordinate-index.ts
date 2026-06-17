import { DESTINATION_CROSSWALK } from '../config/destination-crosswalk.js';
import type { JvtoWebDestinationDetail } from '../extract/extractTypes.js';

export interface CoordinateEntry {
  lat: number;
  lng: number;
  source: 'jvto_web';
  confidence: 'verified';
  slug: string;
}

/** core id -> verified coordinate, resolvable directly or via the crosswalk. */
export interface CoordinateIndex {
  byCoreId: Map<string, CoordinateEntry>;
}

/**
 * Build a verified coordinate index by slug-joining the jvto-web destination
 * extract against DESTINATION_CROSSWALK. Only destinations that exist in the
 * jvto-web registry get coordinates; everything else stays absent (an explicit
 * gap for the consumer, never an invented value).
 */
export function buildLocationCoordinateIndex(
  destinationDetails: ReadonlyArray<JvtoWebDestinationDetail>
): CoordinateIndex {
  const bySlug = new Map<string, JvtoWebDestinationDetail>();
  for (const d of destinationDetails) {
    if (d.latitude != null && d.longitude != null) bySlug.set(d.slug.toLowerCase(), d);
  }

  const byCoreId = new Map<string, CoordinateEntry>();
  for (const entry of DESTINATION_CROSSWALK) {
    if (!entry.slug) continue;
    const match = bySlug.get(entry.slug.toLowerCase());
    if (!match || match.latitude == null || match.longitude == null) continue;
    byCoreId.set(entry.coreId, {
      lat: match.latitude,
      lng: match.longitude,
      source: 'jvto_web',
      confidence: 'verified',
      slug: entry.slug
    });
  }

  return { byCoreId };
}

export function lookupCoordinate(index: CoordinateIndex, coreId: string | null): CoordinateEntry | null {
  if (!coreId) return null;
  return index.byCoreId.get(coreId) ?? null;
}
