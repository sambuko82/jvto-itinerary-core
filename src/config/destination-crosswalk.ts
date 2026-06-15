/**
 * Destination crosswalk (jvto-web sourced).
 *
 * Canonical map between the core string destination ids used across the
 * generated datasets and the jvto-web destination registry
 * (jvto-devteam/jvto-web: src/data/destinations.ts + prisma `destinations` model).
 *
 * Verifiable dimension (from committed jvto-web files):
 *   core id <-> jvto-web id <-> slug <-> name <-> aliases
 * The jvto-web `slug` is unique and is the stable cross-system join key.
 *
 * UNVERIFIED dimension: the numeric new-backoffice `destinations.id` (referenced
 * by hotels/activities in the ExportDataItineraryCore bundle) lives only in the
 * shared database — it is NOT present in any committed jvto-web file. Until a
 * backoffice destinations export (keyed by slug/name) is ingested, numeric ids
 * carry provenance `fixture_placeholder_unverified` (matching the local fixture)
 * or `unknown`, and must not be treated as verified.
 */

export type BackofficeIdProvenance = 'verified' | 'fixture_placeholder_unverified' | 'unknown';

export interface DestinationCrosswalkEntry {
  /** id used across generated datasets (e.g. 09 accommodation, 06 profiles). */
  coreId: string;
  /** jvto-web src/data/destinations.ts id, or null if core-only (no jvto-web page). */
  jvtoWebId: string | null;
  /** jvto-web unique slug — stable cross-system join key. */
  slug: string | null;
  /** Display name. NEVER emit as a `name` key in generated JSON (PII validator). */
  name: string;
  /** Tokens seen in scenarios / backoffice location groups / booking destinations. */
  aliases: string[];
  /** new-backoffice `destinations.id`; null until a real backoffice export confirms it. */
  backofficeDestinationId: number | null;
  backofficeIdProvenance: BackofficeIdProvenance;
}

export const DESTINATION_CROSSWALK: DestinationCrosswalkEntry[] = [
  {
    coreId: 'bromo',
    jvtoWebId: 'bromo',
    slug: 'mount-bromo',
    name: 'Mount Bromo',
    aliases: ['bromo', 'mount bromo', 'gunung bromo'],
    backofficeDestinationId: 2,
    backofficeIdProvenance: 'fixture_placeholder_unverified'
  },
  {
    coreId: 'ijen',
    jvtoWebId: 'ijen',
    slug: 'ijen-crater',
    name: 'Ijen Crater',
    aliases: ['ijen', 'kawah ijen', 'ijen crater'],
    backofficeDestinationId: 5,
    backofficeIdProvenance: 'fixture_placeholder_unverified'
  },
  {
    coreId: 'tumpak_sewu',
    jvtoWebId: 'tumpak-sewu',
    slug: 'tumpak-sewu-waterfall',
    name: 'Tumpak Sewu Waterfall',
    aliases: ['tumpak sewu', 'tumpak-sewu', 'tumpak sewu waterfall'],
    backofficeDestinationId: null,
    backofficeIdProvenance: 'unknown'
  },
  {
    coreId: 'madakaripura',
    jvtoWebId: 'madakaripura',
    slug: 'madakaripura-waterfall',
    name: 'Madakaripura Waterfall',
    aliases: ['madakaripura', 'madakaripura waterfall'],
    backofficeDestinationId: null,
    backofficeIdProvenance: 'unknown'
  },
  {
    coreId: 'papuma',
    jvtoWebId: 'papuma-beach',
    slug: 'papuma-beach',
    name: 'Papuma Beach',
    aliases: ['papuma', 'papuma beach', 'tanjung papuma'],
    backofficeDestinationId: null,
    backofficeIdProvenance: 'unknown'
  },
  {
    coreId: 'malang_batu',
    jvtoWebId: 'malang',
    slug: 'malang-highlands',
    name: 'Malang City',
    aliases: ['malang', 'batu', 'malang batu', 'malang highlands'],
    backofficeDestinationId: null,
    backofficeIdProvenance: 'unknown'
  },
  {
    coreId: 'surabaya_city',
    jvtoWebId: 'surabaya',
    slug: 'surabaya-city',
    name: 'Surabaya City',
    aliases: ['surabaya', 'surabaya city'],
    backofficeDestinationId: null,
    backofficeIdProvenance: 'unknown'
  },
  {
    coreId: 'bali_ketapang',
    jvtoWebId: null,
    slug: null,
    name: 'Bali / Ketapang crossing',
    aliases: ['bali', 'ketapang', 'gilimanuk', 'denpasar'],
    backofficeDestinationId: null,
    backofficeIdProvenance: 'unknown'
  }
];

const byCoreId = new Map(DESTINATION_CROSSWALK.map((e) => [e.coreId, e]));

/** Resolve a free-text token (scenario / backoffice destination / slug) to a core id. */
export function resolveDestinationToken(token: string): string | null {
  const v = token.trim().toLowerCase();
  if (v === '') return null;
  for (const e of DESTINATION_CROSSWALK) {
    if (e.coreId.toLowerCase() === v) return e.coreId;
    if (e.jvtoWebId && e.jvtoWebId.toLowerCase() === v) return e.coreId;
    if (e.slug && e.slug.toLowerCase() === v) return e.coreId;
    if (e.name.toLowerCase() === v) return e.coreId;
    if (e.aliases.some((a) => a.toLowerCase() === v)) return e.coreId;
  }
  return null;
}

export function crosswalkByCoreId(coreId: string): DestinationCrosswalkEntry | null {
  return byCoreId.get(coreId) ?? null;
}

/** Backoffice numeric destination id for a core id, or null when unverified/unknown. */
export function coreIdToBackofficeDestinationId(coreId: string): number | null {
  return byCoreId.get(coreId)?.backofficeDestinationId ?? null;
}
