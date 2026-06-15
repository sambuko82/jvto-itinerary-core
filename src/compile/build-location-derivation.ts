import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import type { LlmWikiExtract } from '../extract/extractTypes.js';
import { slugTokens } from './build-package-catalog-index.js';
import {
  buildSourceContext,
  groupSlugTokens,
  aliasesForNode,
  type SourceContext,
  type SourceStrength
} from './route-source.js';

/**
 * Derive location nodes from connected extracts, now with SOURCE-BACKED compound
 * grouping (route-source). Compound tokens (e.g. tumpak+sewu) merge only when a
 * source phrase supports the window; otherwise they stay split + flagged. No
 * hardcoded destinations, no invented places, no guessed coordinates.
 */

export interface DerivedNode {
  node_id: string;
  member_tokens: string[];
  roles: Set<string>;
  referenced_by_slugs: Set<string>;
  aliases: Map<string, Set<string>>;
  source_strength: SourceStrength;
  sources: Set<string>;
}

function normalizeId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const STRENGTH_RANK: Record<SourceStrength, number> = {
  confirmed: 4,
  supported: 3,
  title_supported: 2,
  fallback: 1,
  unresolved: 0
};

export interface LocationDerivation {
  nodes: DerivedNode[];
  ctx: SourceContext;
}

export async function deriveLocationNodes(dir: string = GENERATED_DIR): Promise<LocationDerivation> {
  const extract = await readJson<LlmWikiExtract>(`${dir}/extract-llm-wiki.json`);
  const ctx = await buildSourceContext(dir);
  const nodes = new Map<string, DerivedNode>();

  const ensure = (id: string, member: string[]): DerivedNode => {
    let n = nodes.get(id);
    if (!n) {
      n = {
        node_id: id,
        member_tokens: member,
        roles: new Set(),
        referenced_by_slugs: new Set(),
        aliases: new Map(),
        source_strength: 'unresolved',
        sources: new Set()
      };
      nodes.set(id, n);
    }
    return n;
  };
  const addAlias = (n: DerivedNode, alias: string, source: string) => {
    const set = n.aliases.get(alias) ?? new Set<string>();
    set.add(source);
    n.aliases.set(alias, set);
  };
  const bump = (n: DerivedNode, s: SourceStrength, sources: string[]) => {
    if (STRENGTH_RANK[s] > STRENGTH_RANK[n.source_strength]) n.source_strength = s;
    for (const src of sources) n.sources.add(src);
  };

  for (const p of extract.packages) {
    if (p.origin) {
      const oid = normalizeId(p.origin);
      const on = ensure(oid, [oid]);
      on.roles.add('origin');
      on.referenced_by_slugs.add(p.slug);
      addAlias(on, p.origin, 'package-registry.json:origin');
      addAlias(on, `from-${p.origin}`, 'package-registry.json:public_url');
      bump(on, 'supported', ['llm-wiki:package-registry.origin']);
    }
    const grouped = groupSlugTokens(slugTokens(p.slug), ctx);
    for (const g of grouped) {
      const dn = ensure(g.node_id, g.member_tokens);
      dn.roles.add('destination');
      dn.referenced_by_slugs.add(p.slug);
      addAlias(dn, g.member_tokens.join(' '), 'package-registry.json:slug');
      bump(dn, g.source_strength, g.sources);
      for (const a of aliasesForNode(g.member_tokens, ctx)) addAlias(dn, a, 'jvto-web/new-backoffice:label');
    }
  }

  return { nodes: [...nodes.values()].sort((a, b) => a.node_id.localeCompare(b.node_id)), ctx };
}

export function nodeConfidence(n: DerivedNode): { confidence: 'high' | 'medium' | 'low'; ambiguous: boolean } {
  if (n.source_strength === 'confirmed') return { confidence: 'high', ambiguous: false };
  if (n.source_strength === 'supported' || n.source_strength === 'title_supported') {
    return { confidence: 'medium', ambiguous: n.source_strength === 'title_supported' };
  }
  return { confidence: 'low', ambiguous: true };
}
