import { GENERATED_DIR } from '../config/paths.js';
import { baseRecord, inventoryGeneratedAt, type InventoryRecord } from '../config/inventory-meta.js';
import { deriveRoutes } from './build-route-derivation.js';

const LLM_REPO = 'sambuko82/llm-wiki';
const REGISTRY_PATH = 'output/products/package-readiness/package-registry.json';

const LEG_MISSING = [
  'distance_km_operator',
  'distance_km_mapbox',
  'duration_minutes_operator',
  'duration_minutes_mapbox',
  'road_profile',
  'night_drive_possible',
  'meal_stop_possible'
];

export interface RouteLegRecord extends InventoryRecord {
  route_leg_id: string;
  from_node: string;
  to_node: string;
  distance_km_operator: null;
  distance_km_mapbox: null;
  duration_minutes_operator: null;
  duration_minutes_mapbox: null;
  road_profile: string[];
  night_drive_possible: null;
  meal_stop_possible: null;
  used_by_packages: string[];
  both_nodes_known: boolean;
  touches_ambiguous_node: boolean;
}

export async function buildRouteLegIndexDerived(dir: string = GENERATED_DIR): Promise<RouteLegRecord[]> {
  const generated_at = inventoryGeneratedAt();
  const { legs } = await deriveRoutes(dir);

  return legs.map<RouteLegRecord>((leg) => {
    const missing_fields = [...LEG_MISSING];
    if (leg.touches_ambiguous_node) missing_fields.push('node_disambiguation');

    return {
      ...baseRecord(`leg__${leg.route_leg_id}`, [{ repo: LLM_REPO, path: REGISTRY_PATH, field: leg.route_leg_id }], {
        generated_at,
        confidence: leg.touches_ambiguous_node ? 'low' : 'high',
        status: leg.touches_ambiguous_node ? 'incomplete' : 'active',
        missing_fields
      }),
      route_leg_id: leg.route_leg_id,
      from_node: leg.from_node,
      to_node: leg.to_node,
      distance_km_operator: null,
      distance_km_mapbox: null,
      duration_minutes_operator: null,
      duration_minutes_mapbox: null,
      road_profile: [], // not derivable from source; never guessed
      night_drive_possible: null,
      meal_stop_possible: null,
      used_by_packages: [...leg.used_by_packages].sort(),
      both_nodes_known: leg.both_nodes_known,
      touches_ambiguous_node: leg.touches_ambiguous_node
    };
  });
}
