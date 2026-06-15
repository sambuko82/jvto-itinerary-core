import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import type { LlmWikiExtract } from '../extract/extractTypes.js';
import { slugTokens } from './build-package-catalog-index.js';

/**
 * Derive location nodes ONLY from connected extract data (no hardcoded lists, no
 * invented places): package origins + slug destination tokens. Shared by the
 * route-node-index and location-alias-registry builders so both stay consistent.
 */

export interface DerivedNode {
  node_id: string;
  roles: Set<string>;
  referenced_by_slugs: Set<string>;
  /** alias -> set of source descriptors (where the spelling was observed). */
  aliases: Map<string, Set<string>>;
  /** true if this destination token ever appeared as the sole token of a slug. */
  standalone: boolean;
}

function normalizeId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export async function deriveLocationNodes(dir: string = GENERATED_DIR): Promise<DerivedNode[]> {
  const extract = await readJson<LlmWikiExtract>(`${dir}/extract-llm-wiki.json`);
  const nodes = new Map<string, DerivedNode>();

  const ensure = (id: string): DerivedNode => {
    let n = nodes.get(id);
    if (!n) {
      n = { node_id: id, roles: new Set(), referenced_by_slugs: new Set(), aliases: new Map(), standalone: false };
      nodes.set(id, n);
    }
    return n;
  };
  const addAlias = (n: DerivedNode, alias: string, source: string) => {
    const set = n.aliases.get(alias) ?? new Set<string>();
    set.add(source);
    n.aliases.set(alias, set);
  };

  for (const p of extract.packages) {
    // origin node
    if (p.origin) {
      const oid = normalizeId(p.origin);
      const on = ensure(oid);
      on.roles.add('origin');
      on.referenced_by_slugs.add(p.slug);
      addAlias(on, p.origin, 'package-registry.json:origin');
      addAlias(on, `from-${p.origin}`, 'package-registry.json:public_url');
    }
    // destination tokens from slug
    const tokens = slugTokens(p.slug);
    for (const t of tokens) {
      const id = normalizeId(t);
      const dn = ensure(id);
      dn.roles.add('destination');
      dn.referenced_by_slugs.add(p.slug);
      addAlias(dn, t, 'package-registry.json:slug');
      if (tokens.length === 1) dn.standalone = true;
    }
  }

  return [...nodes.values()].sort((a, b) => a.node_id.localeCompare(b.node_id));
}

export function nodeConfidence(n: DerivedNode): { confidence: 'high' | 'low'; ambiguous: boolean } {
  const high = n.roles.has('origin') || n.standalone;
  return { confidence: high ? 'high' : 'low', ambiguous: !high };
}
