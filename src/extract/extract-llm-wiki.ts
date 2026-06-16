import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INPUT_DIR } from '../config/paths.js';
import { inventoryGeneratedAt, type InventorySourceTrace } from '../config/inventory-meta.js';
import type {
  LlmWikiExtract,
  LlmWikiPackage,
  LlmWikiPricing,
  LlmWikiItinerary,
  LlmWikiCompatibility
} from './extractTypes.js';

const REPO = 'sambuko82/llm-wiki';
const BASE = 'output/products/package-readiness';
const DIR = resolve(INPUT_DIR, 'llm-wiki/package-readiness');

function readSnapshot<T>(file: string, missing: string[]): T[] {
  try {
    const parsed = JSON.parse(readFileSync(resolve(DIR, file), 'utf8'));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    missing.push(file);
    return [];
  }
}

function trace(file: string, field: string | null = null): InventorySourceTrace {
  return { repo: REPO, path: `${BASE}/${file}`, field };
}

/**
 * Connected llm-wiki extractor (Phase 2). Reads the committed package-readiness
 * snapshots in input/ and normalizes them; no network, no PII (package metadata only).
 */
export async function extractLlmWiki(): Promise<LlmWikiExtract> {
  const missing_fields: string[] = [];

  const registry = readSnapshot<Record<string, unknown>>('package-registry.json', missing_fields);
  const pricing = readSnapshot<Record<string, unknown>>('package-pricing.json', missing_fields);
  const itineraries = readSnapshot<Record<string, unknown>>('package-itineraries.json', missing_fields);
  const compat = readSnapshot<Record<string, unknown>>('booking-compatibility.json', missing_fields);

  const packages: LlmWikiPackage[] = registry.map((p) => ({
    package_id: String(p.package_id),
    slug: String(p.slug),
    origin: (p.origin as string) ?? null,
    duration: (p.duration as string) ?? null,
    public_url: (p.public_url as string) ?? null,
    ijen_relevant: (p.ijen_relevant as boolean) ?? null,
    visits_madakaripura: (p.visits_madakaripura as boolean) ?? null,
    is_specialty: (p.is_specialty as boolean) ?? null
  }));

  const pricingOut: LlmWikiPricing[] = pricing.map((p) => {
    const tiers = (p.pax_tiers as Array<{ idr_per_person?: number }> | undefined) ?? [];
    const prices = tiers.map((t) => t.idr_per_person).filter((n): n is number => typeof n === 'number');
    return {
      package_id: String(p.package_id),
      slug: String(p.slug),
      currency: (p.currency as string) ?? null,
      ferry_included: (p.ferry_included as boolean) ?? null,
      pax_tier_count: tiers.length,
      idr_per_person_min: prices.length ? Math.min(...prices) : null,
      idr_per_person_max: prices.length ? Math.max(...prices) : null
    };
  });

  const itinOut: LlmWikiItinerary[] = itineraries.map((p) => {
    const days = Array.isArray(p.days) ? (p.days as Array<Record<string, unknown>>) : [];
    return {
      package_id: String(p.package_id),
      slug: String(p.slug),
      day_count: days.length,
      day_titles: days.map((d) => (typeof d.title === 'string' ? d.title : '')).filter((t) => t.length > 0)
    };
  });

  const compatOut: LlmWikiCompatibility[] = compat.map((p) => ({
    package_id: String(p.package_id),
    slug: String(p.slug),
    instant_book: (p.instant_book as boolean) ?? null,
    whatsapp_assisted: (p.whatsapp_assisted as boolean) ?? null
  }));

  return {
    source_mode: 'source_connected',
    generated_at: inventoryGeneratedAt(),
    status: missing_fields.length ? 'incomplete' : 'active',
    source_trace: [
      trace('package-registry.json'),
      trace('package-pricing.json'),
      trace('package-itineraries.json'),
      trace('booking-compatibility.json')
    ],
    manual_fields: [],
    missing_fields,
    packages,
    pricing: pricingOut,
    itineraries: itinOut,
    booking_compatibility: compatOut
  };
}
