import { GENERATED_DIR } from '../config/paths.js';
import { baseRecord, inventoryGeneratedAt, type InventoryRecord } from '../config/inventory-meta.js';
import { deriveLocationNodes, nodeConfidence } from './build-location-derivation.js';

const LLM_REPO = 'sambuko82/llm-wiki';
const REGISTRY_PATH = 'output/products/package-readiness/package-registry.json';

export interface LocationAliasRecord extends InventoryRecord {
  node_id: string;
  aliases: string[];
  alias_count: number;
  alias_sources: Record<string, string[]>;
  geo: null;
}

export async function buildLocationAliasRegistry(dir: string = GENERATED_DIR): Promise<LocationAliasRecord[]> {
  const generated_at = inventoryGeneratedAt();
  const { nodes } = await deriveLocationNodes(dir);

  return nodes.map<LocationAliasRecord>((n) => {
    const { confidence, ambiguous } = nodeConfidence(n);
    const aliases = [...n.aliases.keys()].sort();
    const alias_sources: Record<string, string[]> = {};
    for (const a of aliases) alias_sources[a] = [...(n.aliases.get(a) ?? new Set())].sort();

    return {
      ...baseRecord(`alias__${n.node_id}`, [{ repo: LLM_REPO, path: REGISTRY_PATH, field: n.node_id }], {
        generated_at,
        confidence,
        status: ambiguous ? 'incomplete' : 'active',
        missing_fields: ['geo'] // geo never guessed
      }),
      node_id: n.node_id,
      aliases,
      alias_count: aliases.length,
      alias_sources,
      geo: null
    };
  });
}
