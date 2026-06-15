import { GENERATED_DIR } from '../config/paths.js';
import { baseRecord, inventoryGeneratedAt, type InventoryRecord } from '../config/inventory-meta.js';
import { deriveLocationNodes, nodeConfidence } from './build-location-derivation.js';
import type { SourceStrength } from './route-source.js';

const LLM_REPO = 'sambuko82/llm-wiki';
const REGISTRY_PATH = 'output/products/package-readiness/package-registry.json';

export interface RouteNodeRecord extends InventoryRecord {
  node_id: string;
  member_tokens: string[];
  node_roles: string[];
  referenced_by_slugs: string[];
  reference_count: number;
  source_strength: SourceStrength;
  source_labels: string[];
  geo: null;
  type: null;
  ambiguous: boolean;
}

export async function buildRouteNodeIndex(dir: string = GENERATED_DIR): Promise<RouteNodeRecord[]> {
  const generated_at = inventoryGeneratedAt();
  const { nodes } = await deriveLocationNodes(dir);

  return nodes.map<RouteNodeRecord>((n) => {
    const { confidence, ambiguous } = nodeConfidence(n);
    const missing_fields = ['geo', 'type']; // never guessed
    if (ambiguous) missing_fields.push('canonical_confirmation');

    return {
      ...baseRecord(`node__${n.node_id}`, [{ repo: LLM_REPO, path: REGISTRY_PATH, field: n.node_id }], {
        generated_at,
        confidence,
        status: ambiguous ? 'incomplete' : 'active',
        missing_fields
      }),
      node_id: n.node_id,
      member_tokens: n.member_tokens,
      node_roles: [...n.roles].sort(),
      referenced_by_slugs: [...n.referenced_by_slugs].sort(),
      reference_count: n.referenced_by_slugs.size,
      source_strength: n.source_strength,
      source_labels: [...n.sources].sort(),
      geo: null,
      type: null,
      ambiguous
    };
  });
}
