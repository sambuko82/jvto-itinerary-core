import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { baseRecord, inventoryGeneratedAt, type InventoryRecord } from '../config/inventory-meta.js';
import { deriveLocationNodes } from './build-location-derivation.js';
import { groupSlugTokens, resolveLabelToNode, type SourceStrength } from './route-source.js';

const LLM_REPO = 'sambuko82/llm-wiki';
const JVTO_REPO = 'jvto-devteam/jvto-web';
const REGISTRY_PATH = 'output/products/package-readiness/package-registry.json';
const DETAIL_PATH = 'src/lib/publicContent/generated/packageDetailSnapshots.json';

const STRENGTH_RANK: Record<SourceStrength, number> = { confirmed: 4, supported: 3, title_supported: 2, fallback: 1, unresolved: 0 };

interface CatalogRow {
  package_id: string;
  slug: string;
  origin: string | null;
  destination_tokens: string[];
  public_url: string | null;
}

export interface MovementCandidate {
  from_label: string;
  to_label: string;
  from_node: string | null;
  to_node: string | null;
  resolved: boolean;
}

export interface CompoundCandidate {
  node_id: string;
  member_tokens: string[];
  source_strength: SourceStrength;
  sources: string[];
}

export interface RouteSourceCandidateRecord extends InventoryRecord {
  package_id: string;
  slug: string;
  candidate_source: 'jvto_web_package_detail' | 'llm_wiki_titles' | 'slug_fallback';
  route_labels: string[];
  movement_candidates: MovementCandidate[];
  compound_phrase_candidates: CompoundCandidate[];
  unresolved_tokens: string[];
  source_strength: SourceStrength;
}

export interface RouteSourceGapRecord extends InventoryRecord {
  token_or_node: string;
  affected_packages: string[];
  current_problem: string;
  current_source: string[];
  resolution_status: SourceStrength;
  sources_checked: string[];
  missing_stronger_sources: string[];
  recommended_action: string;
}

export interface RouteSourceBundle {
  candidates: RouteSourceCandidateRecord[];
  gaps: RouteSourceGapRecord[];
  packageDetailSnapshotsPresent: boolean;
}

const SOURCES_CHECKED = ['llm-wiki package-itineraries', 'jvto-web packageDetailSnapshots', 'new-backoffice destination_registry'];
const MISSING_STRONGER = ['explicit TravelAction fromLocation/toLocation', 'route_details rows', 'route_destinations rows'];

export async function buildRouteSourceCandidates(dir: string = GENERATED_DIR): Promise<RouteSourceBundle> {
  const generated_at = inventoryGeneratedAt();
  const catalog = await readJson<CatalogRow[]>(`${dir}/package-catalog-index.json`);
  const { nodes, ctx } = await deriveLocationNodes(dir);
  const knownNodes = new Set(nodes.map((n) => n.node_id));
  const packageDetailSnapshotsPresent = ctx.details.length > 0;

  const candidates: RouteSourceCandidateRecord[] = catalog
    .map((p) => {
      const detail = p.public_url ? ctx.detailByUrl.get(p.public_url.replace(/^\//, '')) : undefined;
      const grouped = groupSlugTokens(p.destination_tokens, ctx);

      const movement_candidates: MovementCandidate[] = [];
      if (detail) {
        for (const day of detail.itinerary_days) {
          for (const act of day.activities) {
            if (act.action_type !== 'TravelAction' || !act.from_location || !act.to_location) continue;
            const from_node = resolveLabelToNode(act.from_location, knownNodes, ctx);
            const to_node = resolveLabelToNode(act.to_location, knownNodes, ctx);
            movement_candidates.push({
              from_label: act.from_location,
              to_label: act.to_location,
              from_node,
              to_node,
              resolved: !!(from_node && to_node)
            });
          }
        }
      }

      const compound_phrase_candidates: CompoundCandidate[] = grouped
        .filter((g) => g.member_tokens.length > 1)
        .map((g) => ({ node_id: g.node_id, member_tokens: g.member_tokens, source_strength: g.source_strength, sources: g.sources }));

      const unresolved_tokens = grouped
        .filter((g) => g.source_strength === 'fallback' || g.source_strength === 'unresolved')
        .flatMap((g) => g.member_tokens);

      const candidate_source: RouteSourceCandidateRecord['candidate_source'] = detail
        ? 'jvto_web_package_detail'
        : grouped.some((g) => g.source_strength === 'title_supported')
          ? 'llm_wiki_titles'
          : 'slug_fallback';

      const source_strength = grouped.reduce<SourceStrength>(
        (best, g) => (STRENGTH_RANK[g.source_strength] > STRENGTH_RANK[best] ? g.source_strength : best),
        detail ? 'confirmed' : 'unresolved'
      );

      const missing_fields: string[] = [];
      if (!detail) missing_fields.push('jvto_web_package_detail_snapshots');

      const source_trace = [{ repo: LLM_REPO, path: REGISTRY_PATH, field: p.package_id }];
      if (detail) source_trace.push({ repo: JVTO_REPO, path: DETAIL_PATH, field: detail.public_url });

      return {
        ...baseRecord(`candidate__${p.package_id.replace(/[^a-zA-Z0-9]+/g, '_')}`, source_trace, {
          generated_at,
          confidence: detail ? 'high' : 'medium',
          status: missing_fields.length ? 'incomplete' : 'active',
          missing_fields
        }),
        package_id: p.package_id,
        slug: p.slug,
        candidate_source,
        route_labels: detail?.route_labels ?? [],
        movement_candidates,
        compound_phrase_candidates,
        unresolved_tokens: [...new Set(unresolved_tokens)].sort(),
        source_strength
      };
    })
    .sort((a, b) => a.package_id.localeCompare(b.package_id));

  // Gaps: destination nodes not movement-confirmed (compound or weakly supported).
  const gaps: RouteSourceGapRecord[] = nodes
    .filter((n) => n.roles.has('destination') && n.source_strength !== 'confirmed')
    .map((n) => {
      const multi = n.member_tokens.length > 1;
      return {
        ...baseRecord(`gap__${n.node_id}`, [{ repo: LLM_REPO, path: REGISTRY_PATH, field: n.node_id }], {
          generated_at,
          confidence: 'low',
          status: 'incomplete',
          missing_fields: ['explicit_movement_source']
        }),
        token_or_node: multi ? n.member_tokens.join('/') : n.node_id,
        affected_packages: [...n.referenced_by_slugs].sort(),
        current_problem: multi ? 'split_from_slug_token' : 'slug_token_not_movement_confirmed',
        current_source: [...n.sources].sort(),
        resolution_status: n.source_strength,
        sources_checked: SOURCES_CHECKED,
        missing_stronger_sources: MISSING_STRONGER,
        recommended_action: 'do not finalize route direction/distance until explicit movement source exists'
      };
    })
    .sort((a, b) => a.token_or_node.localeCompare(b.token_or_node));

  return { candidates, gaps, packageDetailSnapshotsPresent };
}
