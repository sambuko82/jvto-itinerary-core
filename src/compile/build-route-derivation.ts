import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';

/**
 * Derive package route sequences + deduplicated route legs ONLY from the Phase 3
 * outputs (package-catalog-index + route-node-index). No invented nodes, no guessed
 * direction/distance. Shared by the route-leg-index and package-route-map builders.
 */

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
}

export interface RouteDerivation {
  routes: DerivedRoute[];
  legs: DerivedLeg[];
  knownNodes: Set<string>;
  ambiguousNodes: Set<string>;
}

export function legId(from: string, to: string): string {
  return `${from}__to__${to}`;
}

export async function deriveRoutes(dir: string = GENERATED_DIR): Promise<RouteDerivation> {
  const catalog = await readJson<
    Array<{ package_id: string; slug: string; origin: string | null; destination_tokens: string[] }>
  >(`${dir}/package-catalog-index.json`);
  const nodeRecords = await readJson<Array<{ node_id: string; ambiguous: boolean }>>(
    `${dir}/route-node-index.json`
  );

  const knownNodes = new Set(nodeRecords.map((n) => n.node_id));
  const ambiguousNodes = new Set(nodeRecords.filter((n) => n.ambiguous).map((n) => n.node_id));

  const legMap = new Map<string, DerivedLeg>();
  const routes: DerivedRoute[] = catalog
    .map((p) => {
      const sequence: string[] = [];
      if (p.origin) sequence.push(p.origin.trim().toLowerCase());
      for (const t of p.destination_tokens) sequence.push(t);

      const legIds: string[] = [];
      for (let i = 1; i < sequence.length; i++) {
        const from = sequence[i - 1];
        const to = sequence[i];
        const id = legId(from, to);
        legIds.push(id);
        let leg = legMap.get(id);
        if (!leg) {
          leg = {
            route_leg_id: id,
            from_node: from,
            to_node: to,
            used_by_packages: new Set(),
            both_nodes_known: knownNodes.has(from) && knownNodes.has(to),
            touches_ambiguous_node: ambiguousNodes.has(from) || ambiguousNodes.has(to)
          };
          legMap.set(id, leg);
        }
        leg.used_by_packages.add(p.package_id);
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
