import { GENERATED_DIR } from '../config/paths.js';
import { baseRecord, inventoryGeneratedAt, type InventoryRecord } from '../config/inventory-meta.js';
import { deriveLocationNodes, nodeConfidence } from './build-location-derivation.js';

const LLM_REPO = 'sambuko82/llm-wiki';
const REGISTRY_PATH = 'output/products/package-readiness/package-registry.json';

export interface RouteNodeRecord extends InventoryRecord {
  node_id: string;
  node_roles: string[];
  referenced_by_slugs: string[];
  reference_count: number;
  standalone_destination: boolean;
  geo: null;
  type: null;
  ambiguous: boolean;
}

export async function buildRouteNodeIndex(dir: string = GENERATED_DIR): Promise<RouteNodeRecord[]> {
  const generated_at = inventoryGeneratedAt();
  const nodes = await deriveLocationNodes(dir);

  return nodes.map<RouteNodeRecord>((n) => {
    const { confidence, ambiguous } = nodeConfidence(n);
    // geo and type are never guessed — always flagged missing in this phase.
    const missing_fields = ['geo', 'type'];
    if (ambiguous) missing_fields.push('canonical_confirmation');

    return {
      ...baseRecord(`node__${n.node_id}`, [{ repo: LLM_REPO, path: REGISTRY_PATH, field: n.node_id }], {
        generated_at,
        confidence,
        status: ambiguous ? 'incomplete' : 'active',
        missing_fields
      }),
      node_id: n.node_id,
      node_roles: [...n.roles].sort(),
      referenced_by_slugs: [...n.referenced_by_slugs].sort(),
      reference_count: n.referenced_by_slugs.size,
      standalone_destination: n.standalone,
      geo: null,
      type: null,
      ambiguous
    };
  });
}
