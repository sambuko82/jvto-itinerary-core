import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { baseRecord, inventoryGeneratedAt, type InventoryRecord } from '../config/inventory-meta.js';
import type { LlmWikiExtract } from '../extract/extractTypes.js';

const LLM_REPO = 'sambuko82/llm-wiki';
const BASE = 'output/products/package-readiness';
const DURATION_TOKEN = /^\d+d\d+n$/i;

/** Destination tokens derived from a package slug (duration tokens removed). */
export function slugTokens(slug: string): string[] {
  return slug
    .split('-')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && !DURATION_TOKEN.test(t));
}

export interface PackageCatalogRecord extends InventoryRecord {
  package_id: string;
  catalog_key: string;
  slug: string;
  origin: string | null;
  duration: string | null;
  day_count: number | null;
  public_url: string | null;
  destination_tokens: string[];
  ijen_relevant: boolean | null;
  visits_madakaripura: boolean | null;
  is_specialty: boolean | null;
  instant_book: boolean | null;
  whatsapp_assisted: boolean | null;
  currency: string | null;
  pax_tier_count: number | null;
  idr_per_person_min: number | null;
  idr_per_person_max: number | null;
}

export async function buildPackageCatalogIndex(dir: string = GENERATED_DIR): Promise<PackageCatalogRecord[]> {
  const extract = await readJson<LlmWikiExtract>(`${dir}/extract-llm-wiki.json`);
  const generated_at = inventoryGeneratedAt();

  const pricingById = new Map(extract.pricing.map((p) => [p.package_id, p]));
  const itinById = new Map(extract.itineraries.map((i) => [i.package_id, i]));
  const compatById = new Map(extract.booking_compatibility.map((c) => [c.package_id, c]));

  return extract.packages
    .map<PackageCatalogRecord>((p) => {
      const pricing = pricingById.get(p.package_id);
      const itin = itinById.get(p.package_id);
      const compat = compatById.get(p.package_id);
      const missing_fields: string[] = [];
      if (!itin) missing_fields.push('day_count');
      if (!pricing) missing_fields.push('pricing');
      if (!compat) missing_fields.push('booking_compatibility');

      return {
        ...baseRecord(
          `package__${p.package_id.replace(/[^a-zA-Z0-9]+/g, '_')}`,
          [
            { repo: LLM_REPO, path: `${BASE}/package-registry.json`, field: p.package_id },
            { repo: LLM_REPO, path: `${BASE}/package-pricing.json`, field: pricing ? p.package_id : null },
            { repo: LLM_REPO, path: `${BASE}/package-itineraries.json`, field: itin ? p.package_id : null },
            { repo: LLM_REPO, path: `${BASE}/booking-compatibility.json`, field: compat ? p.package_id : null }
          ],
          { generated_at, confidence: 'high', status: missing_fields.length ? 'incomplete' : 'active', missing_fields }
        ),
        package_id: p.package_id,
        catalog_key: `${p.origin ?? 'unknown'}/${p.slug}`,
        slug: p.slug,
        origin: p.origin,
        duration: p.duration,
        day_count: itin?.day_count ?? null,
        public_url: p.public_url,
        destination_tokens: slugTokens(p.slug),
        ijen_relevant: p.ijen_relevant,
        visits_madakaripura: p.visits_madakaripura,
        is_specialty: p.is_specialty,
        instant_book: compat?.instant_book ?? null,
        whatsapp_assisted: compat?.whatsapp_assisted ?? null,
        currency: pricing?.currency ?? null,
        pax_tier_count: pricing?.pax_tier_count ?? null,
        idr_per_person_min: pricing?.idr_per_person_min ?? null,
        idr_per_person_max: pricing?.idr_per_person_max ?? null
      };
    })
    .sort((a, b) => a.package_id.localeCompare(b.package_id));
}
