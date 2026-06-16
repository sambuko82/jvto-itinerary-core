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

export type RouteMapStatus = 'confirmed' | 'supported' | 'incomplete';

export interface LegSourceSummary {
  jvto_web_travel_action: number;
  source_supported_sequence: number;
  slug_token_fallback: number;
}

export interface DerivedRoute {
  package_id: string;
  slug: string;
  origin: string | null;
  sequence: string[];
  legIds: string[];
  containsAmbiguous: boolean;
  sequence_basis: 'source_grouped_sequence' | 'slug_token_fallback';
  route_source_strength: SourceStrength;
  route_leg_source_summary: LegSourceSummary;
  route_map_status: RouteMapStatus;
  source_backed_compound_nodes: string[];
  unresolved_movement_labels: string[];
  missing_real: boolean;
}

export interface UnresolvedMovement {
  label: string;
  seenInPackages: Set<string>;
  seenAs: Set<string>;
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
  unresolvedMovements: UnresolvedMovement[];
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

  const unresolvedMap = new Map<string, UnresolvedMovement>();
  const noteUnresolved = (label: string, pkg: string, side: string) => {
    const e = unresolvedMap.get(label) ?? { label, seenInPackages: new Set(), seenAs: new Set() };
    e.seenInPackages.add(pkg);
    e.seenAs.add(side);
    unresolvedMap.set(label, e);
  };

  interface Raw {
    p: CatalogRow;
    sequence: string[];
    legIds: string[];
    compoundNodes: string[];
    unresolvedLabels: Set<string>;
  }

  const raws: Raw[] = catalog.map((p) => {
    // grouped sequence (origin + source-grouped destination nodes)
    const sequence: string[] = [];
    if (p.origin) sequence.push(p.origin.trim().toLowerCase());
    const grouped = groupSlugTokens(p.destination_tokens, ctx);
    const compoundNodes: string[] = [];
    for (const g of grouped) {
      sequence.push(g.node_id);
      if (g.member_tokens.length > 1) compoundNodes.push(g.node_id);
    }

    const legIds: string[] = [];
    for (let i = 1; i < sequence.length; i++) {
      const from = sequence[i - 1];
      const to = sequence[i];
      const supported =
        (strengthById.get(from) ?? 'fallback') !== 'fallback' && (strengthById.get(to) ?? 'fallback') !== 'fallback';
      upsertLeg(from, to, p.package_id, supported ? 'source_supported_sequence' : 'slug_token_fallback');
      legIds.push(legId(from, to));
    }

    const unresolvedLabels = new Set<string>();
    const detail = p.public_url ? ctx.detailByUrl.get(p.public_url.replace(/^\//, '')) : undefined;
    if (detail) {
      for (const day of detail.itinerary_days) {
        for (const act of day.activities) {
          if (act.action_type !== 'TravelAction') continue;
          const fromNode = act.from_location ? resolveLabelToNode(act.from_location, knownNodes, ctx) : null;
          const toNode = act.to_location ? resolveLabelToNode(act.to_location, knownNodes, ctx) : null;
          if (fromNode && toNode && fromNode !== toNode) {
            upsertLeg(fromNode, toNode, p.package_id, 'jvto_web_travel_action');
            if (!legIds.includes(legId(fromNode, toNode))) legIds.push(legId(fromNode, toNode));
          }
          if (act.from_location && !fromNode) { unresolvedLabels.add(act.from_location); noteUnresolved(act.from_location, p.package_id, 'from'); }
          if (act.to_location && !toNode) { unresolvedLabels.add(act.to_location); noteUnresolved(act.to_location, p.package_id, 'to'); }
        }
      }
    }

    return { p, sequence, legIds, compoundNodes, unresolvedLabels };
  });

  const legs = [...legMap.values()].sort((a, b) => a.route_leg_id.localeCompare(b.route_leg_id));
  const legBasisById = new Map(legs.map((l) => [l.route_leg_id, l.source_basis]));

  const routes: DerivedRoute[] = raws
    .map(({ p, sequence, legIds, compoundNodes, unresolvedLabels }): DerivedRoute => {
      const summary: LegSourceSummary = { jvto_web_travel_action: 0, source_supported_sequence: 0, slug_token_fallback: 0 };
      for (const id of legIds) summary[legBasisById.get(id) ?? 'slug_token_fallback'] += 1;

      const destNodes = sequence.filter((n) => n !== (p.origin ?? '').trim().toLowerCase());
      const anyFallback = sequence.some((n) => (strengthById.get(n) ?? 'fallback') === 'fallback');
      const anyUnresolvedNode = sequence.some((n) => (strengthById.get(n) ?? 'fallback') === 'unresolved');
      const hasTA = summary.jvto_web_travel_action > 0;

      const sequence_basis: DerivedRoute['sequence_basis'] = anyFallback || anyUnresolvedNode ? 'slug_token_fallback' : 'source_grouped_sequence';
      const route_source_strength: SourceStrength = hasTA
        ? 'confirmed'
        : anyFallback
          ? 'fallback'
          : anyUnresolvedNode
            ? 'unresolved'
            : 'supported';
      const route_map_status: RouteMapStatus = hasTA ? 'confirmed' : sequence_basis === 'source_grouped_sequence' ? 'supported' : 'incomplete';
      const missing_real = route_map_status === 'incomplete' || anyFallback || anyUnresolvedNode;

      return {
        package_id: p.package_id,
        slug: p.slug,
        origin: p.origin,
        sequence,
        legIds,
        containsAmbiguous: destNodes.some((n) => ambiguousNodes.has(n)),
        sequence_basis,
        route_source_strength,
        route_leg_source_summary: summary,
        route_map_status,
        source_backed_compound_nodes: compoundNodes,
        unresolved_movement_labels: [...unresolvedLabels].sort(),
        missing_real
      };
    })
    .sort((a, b) => a.package_id.localeCompare(b.package_id));

  const unresolvedMovements = [...unresolvedMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  return { routes, legs, knownNodes, ambiguousNodes, unresolvedMovements };
}
