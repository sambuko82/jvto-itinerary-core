import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TomTomGeotagIndex, TomTomNodeEntry, TomTomRoutedLeg } from '../domain/output.js';
import { buildTomTomNodeIndex, type TomTomNodeIndex } from './build-location-coordinate-index.js';

const SEED_PATH = resolve('scripts/tomtom-verified-nodes.json');

interface SeedFile {
  seed_meta: { name: string; generated_at: string };
  nodes: TomTomNodeEntry[];
}

/**
 * Load TomTom verified nodes from the static seed file.
 *
 * Deterministic — no live API calls, no API key required.
 * The seed file is the source of truth for operational node coordinates
 * (airport, harbor, staging towns) not present in the jvto-web destination registry.
 *
 * Pass routingFill (from the output of scripts/fill-tomtom-routing.mjs) to
 * upgrade routed_legs from [] to TomTom road polylines. When absent the index
 * is still valid (fill_status='seed_only', routed_legs=[]).
 */
export async function buildTomTomGeotagIndex(
  routingFill?: TomTomRoutedLeg[] | null
): Promise<{ index: TomTomGeotagIndex; nodeIndex: TomTomNodeIndex }> {
  const raw = await readFile(SEED_PATH, 'utf8');
  const seed = JSON.parse(raw) as SeedFile;

  const nodes: TomTomNodeEntry[] = seed.nodes;
  const routed_legs: TomTomRoutedLeg[] = routingFill ?? [];

  const verifiedCount = nodes.filter((n) => n.confidence === 'verified_tomtom_api').length;

  const index: TomTomGeotagIndex = {
    id: 'tomtom_geotag_index',
    label: 'TomTom-verified node coordinates and road-routed corridor polylines',
    status: 'active',
    confidence: 'verified',
    source_trace: [
      {
        source: 'tomtom',
        ref: 'scripts/tomtom-verified-nodes.json',
        field: 'lat,lng,entry_point,tomtom_category',
        confidence: 'verified'
      }
    ],
    nodes,
    routed_legs,
    fill_status: routed_legs.length > 0 ? 'routing_filled' : 'seed_only',
    fill_generated_at: routed_legs.length > 0 ? (routed_legs[0]?.routed_at ?? null) : null
  };

  const nodeIndex = buildTomTomNodeIndex(nodes);

  void verifiedCount; // surfaced in tests; not emitted to avoid stale counts in JSON
  return { index, nodeIndex };
}
