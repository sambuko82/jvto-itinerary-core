import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { deriveLocationNodes } from './build-location-derivation.js';
import { groupSlugTokens, resolveLabelToNode, type SourceContext, type SourceStrength } from './route-source.js';

/**
 * Derive package route sequences + deduplicated legs, now SOURCE-BACKED:
 * - sequences use source-grouped node ids (compounds merged when source supports);
 * - legs confirmed by jvto-web TravelAction movements carry source_basis
 *   "jvto_web_travel_action" (real direction); otherwise sequence/fallback.
 * No guessed distance/duration/direction.
 */

export type LegSourceBasis = 'jvto_web_travel_action' | 'source_supported_sequence' | 'slug_token_fallback';

export interface DerivedRoute {
  package_id: string;
  slug: string;
  origin: string | null;
  sequence: string[];
  legIds: string[];
  containsAmbiguous: boolean;
}

export interface DerivedLeg {
  route_leg_id: string;
  from_node: string;
  to_node: string;
  used_by_packages: Set<string>;
  both_nodes_known: boolean;
  touches_ambiguous_node: boolean;
  source_basis: LegSourceBasis;
}

export interface RouteDerivation {
  routes: DerivedRoute[];
  legs: DerivedLeg[];
  knownNodes: Set<string>;
  ambiguousNodes: Set<string>;
}

interface CatalogRow {
  package_id: string;
  slug: string;
  origin: string | null;
  destination_tokens: string[];
  public_url: string | null;
}

export function legId(from: string, to: string): string {
  return `${from}__to__${to}`;
}

const BASIS_RANK: Record<LegSourceBasis, number> = {
  jvto_web_travel_action: 3,
  source_supported_sequence: 2,
  slug_token_fallback: 1
};

export async function deriveRoutes(dir: string = GENERATED_DIR): Promise<RouteDerivation> {
  const catalog = await readJson<CatalogRow[]>(`${dir}/package-catalog-index.json`);
  const { nodes, ctx } = await deriveLocationNodes(dir);

  const knownNodes = new Set(nodes.map((n) => n.node_id));
  const ambiguousNodes = new Set(
    nodes.filter((n) => n.source_strength === 'title_supported' || n.source_strength === 'fallback' || n.source_strength === 'unresolved').map((n) => n.node_id)
  );
  const strengthById = new Map<string, SourceStrength>(nodes.map((n) => [n.node_id, n.source_strength]));

  const legMap = new Map<string, DerivedLeg>();
  const upsertLeg = (from: string, to: string, pkg: string, basis: LegSourceBasis) => {
    const id = legId(from, to);
    let leg = legMap.get(id);
    if (!leg) {
      leg = {
        route_leg_id: id,
        from_node: from,
        to_node: to,
        used_by_packages: new Set(),
        both_nodes_known: knownNodes.has(from) && knownNodes.has(to),
        touches_ambiguous_node: ambiguousNodes.has(from) || ambiguousNodes.has(to),
        source_basis: basis
      };
      legMap.set(id, leg);
    }
    leg.used_by_packages.add(pkg);
    if (BASIS_RANK[basis] > BASIS_RANK[leg.source_basis]) leg.source_basis = basis;
    return leg;
  };

  const routes: DerivedRoute[] = catalog
    .map((p) => {
      // grouped sequence (origin + source-grouped destination nodes)
      const sequence: string[] = [];
      if (p.origin) sequence.push(p.origin.trim().toLowerCase());
      for (const g of groupSlugTokens(p.destination_tokens, ctx)) sequence.push(g.node_id);

      const legIds: string[] = [];
      for (let i = 1; i < sequence.length; i++) {
        const from = sequence[i - 1];
        const to = sequence[i];
        const supported =
          (strengthById.get(from) ?? 'fallback') !== 'fallback' && (strengthById.get(to) ?? 'fallback') !== 'fallback';
        const basis: LegSourceBasis = supported ? 'source_supported_sequence' : 'slug_token_fallback';
        upsertLeg(from, to, p.package_id, basis);
        legIds.push(legId(from, to));
      }

      // jvto-web TravelAction confirmed movements (real direction)
      const detail = p.public_url ? ctx.detailByUrl.get(p.public_url.replace(/^\//, '')) : undefined;
      if (detail) {
        for (const day of detail.itinerary_days) {
          for (const act of day.activities) {
            if (act.action_type !== 'TravelAction') continue;
            const from = act.from_location ? resolveLabelToNode(act.from_location, knownNodes, ctx) : null;
            const to = act.to_location ? resolveLabelToNode(act.to_location, knownNodes, ctx) : null;
            if (from && to && from !== to) {
              upsertLeg(from, to, p.package_id, 'jvto_web_travel_action');
              if (!legIds.includes(legId(from, to))) legIds.push(legId(from, to));
            }
          }
        }
      }

      return {
        package_id: p.package_id,
        slug: p.slug,
        origin: p.origin,
        sequence,
        legIds,
        containsAmbiguous: sequence.some((n) => ambiguousNodes.has(n))
      };
    })
    .sort((a, b) => a.package_id.localeCompare(b.package_id));

  const legs = [...legMap.values()].sort((a, b) => a.route_leg_id.localeCompare(b.route_leg_id));
  return { routes, legs, knownNodes, ambiguousNodes };
}
