import { DESTINATION_CROSSWALK } from '../config/destination-crosswalk.js';
import type { JvtoWebDestinationDetail } from '../extract/extractTypes.js';
import type { TomTomNodeEntry } from '../domain/output.js';

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

/** Lookup index for TomTom-verified operational route nodes (transit nodes, airports, harbors). */
export interface TomTomNodeIndex {
  byNodeId: Map<string, TomTomNodeEntry>;
}

/** Build a TomTom node lookup index from the verified nodes seed. Registers aliases too. */
export function buildTomTomNodeIndex(nodes: TomTomNodeEntry[]): TomTomNodeIndex {
  const byNodeId = new Map<string, TomTomNodeEntry>();
  for (const n of nodes) {
    byNodeId.set(n.node_id, n);
    if (n.node_id_aliases) {
      for (const alias of n.node_id_aliases) byNodeId.set(alias, n);
    }
  }
  return { byNodeId };
}

export function lookupTomTomNode(index: TomTomNodeIndex, nodeId: string): TomTomNodeEntry | null {
  return index.byNodeId.get(nodeId) ?? null;
}
