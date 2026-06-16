import { GENERATED_DIR } from '../config/paths.js';
import { baseRecord, inventoryGeneratedAt, type InventoryRecord } from '../config/inventory-meta.js';
import { deriveRoutes, type LegSourceSummary, type RouteMapStatus } from './build-route-derivation.js';
import type { SourceStrength } from './route-source.js';

const LLM_REPO = 'sambuko82/llm-wiki';
const JVTO_REPO = 'jvto-devteam/jvto-web';
const BASE = 'output/products/package-readiness';
const DETAIL_PATH = 'src/lib/publicContent/generated/packageDetailSnapshots.json';

export interface PackageRouteMapRecord extends InventoryRecord {
  package_id: string;
  slug: string;
  origin: string | null;
  route_sequence: string[];
  route_leg_ids: string[];
  node_count: number;
  leg_count: number;
  sequence_basis: 'source_grouped_sequence' | 'slug_token_fallback';
  route_source_strength: SourceStrength;
  route_leg_source_summary: LegSourceSummary;
  route_map_status: RouteMapStatus;
  source_backed_compound_nodes: string[];
  unresolved_movement_count: number;
  unresolved_movement_labels: string[];
  contains_ambiguous_node: boolean;
}

const STATUS_CONF: Record<RouteMapStatus, 'high' | 'medium' | 'low'> = {
  confirmed: 'high',
  supported: 'medium',
  incomplete: 'low'
};

export async function buildPackageRouteMapDerived(dir: string = GENERATED_DIR): Promise<PackageRouteMapRecord[]> {
  const generated_at = inventoryGeneratedAt();
  const { routes } = await deriveRoutes(dir);

  return routes.map<PackageRouteMapRecord>((r) => {
    const hasTravelAction = r.route_leg_source_summary.jvto_web_travel_action > 0;
    const source_trace = [
      { repo: LLM_REPO, path: `${BASE}/package-registry.json`, field: r.package_id },
      { repo: LLM_REPO, path: `${BASE}/package-itineraries.json`, field: r.package_id }
    ];
    if (hasTravelAction) source_trace.push({ repo: JVTO_REPO, path: DETAIL_PATH, field: r.slug });

    // Only flag a real, source-grounded gap — no stale travel_direction_confirmation.
    const missing_fields = r.missing_real ? ['explicit_movement_source'] : [];

    return {
      ...baseRecord(`route__${r.package_id.replace(/[^a-zA-Z0-9]+/g, '_')}`, source_trace, {
        generated_at,
        confidence: STATUS_CONF[r.route_map_status],
        status: r.route_map_status === 'incomplete' ? 'incomplete' : 'active',
        missing_fields
      }),
      package_id: r.package_id,
      slug: r.slug,
      origin: r.origin,
      route_sequence: r.sequence,
      route_leg_ids: r.legIds,
      node_count: r.sequence.length,
      leg_count: r.legIds.length,
      sequence_basis: r.sequence_basis,
      route_source_strength: r.route_source_strength,
      route_leg_source_summary: r.route_leg_source_summary,
      route_map_status: r.route_map_status,
      source_backed_compound_nodes: r.source_backed_compound_nodes,
      unresolved_movement_count: r.unresolved_movement_labels.length,
      unresolved_movement_labels: r.unresolved_movement_labels,
      contains_ambiguous_node: r.containsAmbiguous
    };
  });
}
