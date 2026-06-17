import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { extractBackoffice } from '../extract/extract-backoffice.js';
import type { LlmWikiExtract, JvtoWebExtract, JvtoWebPackageDetail } from '../extract/extractTypes.js';

/**
 * Source-backed route resolution. Builds a phrase dictionary ONLY from extracted
 * source labels (no hardcoded destinations) and groups package slug tokens by
 * longest source-backed match. Also exposes confirmed TravelAction movements.
 *
 * Generic geographic/role modifiers (area, hotel, port, …) are stripped during
 * normalization — these are not destination names, so this is not a hardcoded
 * destination list.
 */

const MODIFIERS = new Set([
  'area', 'hotel', 'port', 'harbor', 'harbour', 'city', 'beach', 'park', 'mount',
  'crater', 'waterfall', 'transit', 'point', 'airport', 'side', 'staging', 'transfer',
  'pickup', 'dropoff', 'return', 'overnight', 'sunrise', 'segment', 'the', 'to', 'and',
  'of', 'from', 'in', 'toward', 'towards', 'continue', 'finish', 'your', 'our', 'a',
  'for', 'into', 'sequence', 'experience', 'day', 'tour', 'trip'
]);

export type SourceStrength = 'confirmed' | 'supported' | 'title_supported' | 'fallback' | 'unresolved';

export interface GroupedNode {
  node_id: string;
  member_tokens: string[];
  source_strength: SourceStrength;
  sources: string[];
}

interface Phrase {
  raw: string;
  core: string[];
  source: string;
}

export interface SourceContext {
  /** Atomic single-place labels — the ONLY source for multi-token compound grouping. */
  phrases: Phrase[];
  /** Tokens seen in (multi-destination) day titles/summaries — single-token evidence only. */
  titleTokens: Set<string>;
  movements: string[][]; // core token arrays from TravelAction from/to/destination
  details: JvtoWebPackageDetail[];
  detailByUrl: Map<string, JvtoWebPackageDetail>;
  maxPhraseLen: number;
}

export function normalizeCore(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !MODIFIERS.has(t) && !/^\d+d\d+n$/.test(t));
}

function contiguousContains(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

export async function buildSourceContext(dir: string = GENERATED_DIR): Promise<SourceContext> {
  const llm = await readJson<LlmWikiExtract>(`${dir}/extract-llm-wiki.json`);
  const jvto = await readJson<JvtoWebExtract>(`${dir}/extract-jvto-web.json`);
  const backoffice = await extractBackoffice();

  // ATOMIC single-place labels only (each names ONE destination) — drive compound grouping.
  const phrases: Phrase[] = [];
  const addAtomic = (label: string, source: string) => {
    const core = normalizeCore(label);
    if (core.length > 0) phrases.push({ raw: label.trim(), core, source });
  };
  // Multi-destination text (day titles/summaries) — single-token evidence ONLY.
  const titleTokens = new Set<string>();
  const addTitle = (text: string) => {
    for (const t of normalizeCore(text)) titleTokens.add(t);
  };

  for (const d of backoffice.destination_registry) {
    if (d.name) addAtomic(d.name, 'new-backoffice:destinations.name');
    if (d.slug) addAtomic(d.slug.replace(/-/g, ' '), 'new-backoffice:destinations.slug');
  }

  const movements: string[][] = [];
  for (const det of jvto.package_details) {
    for (const r of det.route_labels) addAtomic(r, 'jvto-web:product.route');
    for (const k of det.key_experiences) addAtomic(k, 'jvto-web:keyExperiences');
    for (const a of det.accommodation_areas) addAtomic(a, 'jvto-web:accommodationPlan.area');
    for (const day of det.itinerary_days) {
      if (day.title) addTitle(day.title);
      if (day.summary) addTitle(day.summary);
      for (const act of day.activities) {
        for (const loc of [act.from_location, act.to_location, act.destination]) {
          if (loc) {
            addAtomic(loc, 'jvto-web:travelAction');
            const core = normalizeCore(loc);
            if (core.length) movements.push(core);
          }
        }
      }
    }
  }

  for (const it of llm.itineraries) for (const t of it.day_titles) addTitle(t);

  const detailByUrl = new Map<string, JvtoWebPackageDetail>();
  for (const det of jvto.package_details) {
    detailByUrl.set(det.public_url.replace(/^\//, ''), det);
  }

  const maxPhraseLen = phrases.reduce((m, p) => Math.max(m, p.core.length), 1);
  return { phrases, titleTokens, movements, details: jvto.package_details, detailByUrl, maxPhraseLen };
}

function windowSupport(window: string[], ctx: SourceContext): { strength: SourceStrength; sources: string[] } {
  const matching = ctx.phrases.filter((p) => contiguousContains(p.core, window));
  const windowSet = new Set(window);
  // A TravelAction movement confirms the window when its core tokens appear contiguously
  // inside the window, OR — for a same-place label variant (e.g. the movement endpoint
  // "Prigen Safari Park" → [prigen, safari] vs the slug-derived window "taman safari prigen")
  // — when the movement core is a >=2-token subset of an already source-named window.
  // The subset path is gated on an atomic-phrase match (matching.length > 0) so it only
  // upgrades windows that already name a real destination, never bare/unnamed tokens.
  const movementConfirmed = ctx.movements.some(
    (m) =>
      contiguousContains(m, window) ||
      (matching.length > 0 && m.length >= 2 && m.every((t) => windowSet.has(t)))
  );
  if (movementConfirmed) {
    const srcs = ['jvto-web:travelAction', ...matching.map((p) => p.source)];
    return { strength: 'confirmed', sources: [...new Set(srcs)].sort() };
  }
  if (matching.length > 0) {
    return { strength: 'supported', sources: [...new Set(matching.map((p) => p.source))].sort() };
  }
  // single tokens only: fall back to multi-destination title evidence
  if (window.length === 1 && ctx.titleTokens.has(window[0])) {
    return { strength: 'title_supported', sources: ['llm-wiki/jvto-web:day_title'] };
  }
  return { strength: 'unresolved', sources: [] };
}

/**
 * Group a package's slug destination tokens by longest source-backed phrase match.
 * Compound tokens merge ONLY when a source phrase supports the contiguous window.
 */
export function groupSlugTokens(tokens: string[], ctx: SourceContext): GroupedNode[] {
  const out: GroupedNode[] = [];
  const cap = Math.min(ctx.maxPhraseLen, 4);
  let i = 0;
  while (i < tokens.length) {
    let matched: GroupedNode | null = null;
    for (let len = Math.min(cap, tokens.length - i); len >= 2; len--) {
      const window = tokens.slice(i, i + len);
      const sup = windowSupport(window, ctx);
      if (sup.strength === 'confirmed' || sup.strength === 'supported' || sup.strength === 'title_supported') {
        matched = { node_id: window.join('_'), member_tokens: window, source_strength: sup.strength, sources: sup.sources };
        i += len;
        break;
      }
    }
    if (!matched) {
      const single = [tokens[i]];
      const sup = windowSupport(single, ctx);
      matched = { node_id: tokens[i], member_tokens: single, source_strength: sup.strength === 'unresolved' ? 'fallback' : sup.strength, sources: sup.sources };
      i += 1;
    }
    out.push(matched);
  }
  return out;
}

/** Source-spelling aliases for a node: short supported-tier labels whose core contains the tokens. */
export function aliasesForNode(memberTokens: string[], ctx: SourceContext): string[] {
  const aliases = new Set<string>();
  for (const p of ctx.phrases) {
    if (p.core.length > memberTokens.length + 2) continue; // short single-place labels only
    if (contiguousContains(p.core, memberTokens)) aliases.add(p.raw);
  }
  return [...aliases].sort();
}

/** Resolve a free-text source label to a known grouped node id (best contiguous overlap). */
export function resolveLabelToNode(label: string, knownNodeIds: Set<string>, ctx: SourceContext): string | null {
  const core = normalizeCore(label);
  if (core.length === 0) return null;
  // try longest contiguous window that equals a known node id
  for (let len = Math.min(core.length, 4); len >= 1; len--) {
    for (let i = 0; i + len <= core.length; i++) {
      const id = core.slice(i, i + len).join('_');
      if (knownNodeIds.has(id)) return id;
    }
  }
  return null;
}
