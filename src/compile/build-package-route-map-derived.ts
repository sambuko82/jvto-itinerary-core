import { GENERATED_DIR } from '../config/paths.js';
import { baseRecord, inventoryGeneratedAt, type InventoryRecord } from '../config/inventory-meta.js';
import { deriveRoutes } from './build-route-derivation.js';

const LLM_REPO = 'sambuko82/llm-wiki';
const BASE = 'output/products/package-readiness';

export interface PackageRouteMapRecord extends InventoryRecord {
  package_id: string;
  slug: string;
  origin: string | null;
  route_sequence: string[];
  route_leg_ids: string[];
  node_count: number;
  leg_count: number;
  sequence_basis: 'slug_token_order_from_catalog';
  contains_ambiguous_node: boolean;
}

export async function buildPackageRouteMapDerived(dir: string = GENERATED_DIR): Promise<PackageRouteMapRecord[]> {
  const generated_at = inventoryGeneratedAt();
  const { routes } = await deriveRoutes(dir);

  return routes.map<PackageRouteMapRecord>((r) => {
    const missing_fields: string[] = ['travel_direction_confirmation'];
    if (r.sequence.length < 2) missing_fields.push('route_legs');

    return {
      ...baseRecord(
        `route__${r.package_id.replace(/[^a-zA-Z0-9]+/g, '_')}`,
        [
          { repo: LLM_REPO, path: `${BASE}/package-registry.json`, field: r.package_id },
          { repo: LLM_REPO, path: `${BASE}/package-itineraries.json`, field: r.package_id }
        ],
        { generated_at, confidence: r.containsAmbiguous ? 'low' : 'high', status: r.containsAmbiguous ? 'incomplete' : 'active', missing_fields }
      ),
      package_id: r.package_id,
      slug: r.slug,
      origin: r.origin,
      route_sequence: r.sequence,
      route_leg_ids: r.legIds,
      node_count: r.sequence.length,
      leg_count: r.legIds.length,
      sequence_basis: 'slug_token_order_from_catalog',
      contains_ambiguous_node: r.containsAmbiguous
    };
  });
}
