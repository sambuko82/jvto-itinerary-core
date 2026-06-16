import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INPUT_DIR } from '../config/paths.js';
import { inventoryGeneratedAt, type InventorySourceTrace } from '../config/inventory-meta.js';
import { buildSchemaInventory } from '../compile/build-schema-inventory.js';
import type {
  JvtoWebExtract,
  JvtoWebPackageHelper,
  JvtoWebPackageDetail,
  JvtoWebItineraryDay,
  JvtoWebActivity,
  JvtoWebDestinationDetail,
  JvtoWebRiskFactor
} from './extractTypes.js';

const REPO = 'jvto-devteam/jvto-web';
const LIB_INDEX = resolve(INPUT_DIR, 'jvto-web/lib-packages.index.json');
const PKG_DETAIL = resolve(INPUT_DIR, 'jvto-web/publicContent/generated/packageDetailSnapshots.json');
const DEST_DETAIL = resolve(INPUT_DIR, 'jvto-web/publicContent/generated/destinationDetailSnapshots.json');

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const strList = (arr: unknown, key?: string): string[] => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (key ? (x as Record<string, unknown>)?.[key] : x))
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
};

/** Parse the PII-safe subset of packageDetailSnapshots, if the snapshot exists. */
function parsePackageDetails(missing: string[]): JvtoWebPackageDetail[] {
  let snap: { items?: unknown[] };
  try {
    snap = JSON.parse(readFileSync(PKG_DETAIL, 'utf8'));
  } catch {
    missing.push('jvto_web_package_detail_snapshots');
    return [];
  }
  const items = Array.isArray(snap.items) ? snap.items : [];
  return items.map((raw): JvtoWebPackageDetail => {
    const it = raw as Record<string, unknown>;
    const product = ((it.payload as Record<string, unknown>)?.product ?? {}) as Record<string, unknown>;
    const days = Array.isArray(product.itineraryDays) ? (product.itineraryDays as Array<Record<string, unknown>>) : [];

    const itinerary_days: JvtoWebItineraryDay[] = days.map((d) => {
      const acts = Array.isArray(d.activities) ? (d.activities as Array<Record<string, unknown>>) : [];
      const activities: JvtoWebActivity[] = acts.map((a) => ({
        action_type: str(a.type),
        action_name: str(a.name),
        time_window: str(a.timeWindow),
        duration_minutes: typeof a.durationMinutes === 'number' ? a.durationMinutes : null,
        from_location: str(a.fromLocation),
        to_location: str(a.toLocation),
        destination: str(a.destination)
      }));
      return { day: typeof d.day === 'number' ? d.day : null, title: str(d.title), summary: str(d.summary), activities };
    });

    return {
      public_url: String(it.slug ?? product.slug ?? ''),
      product_slug: str(product.slug),
      origin_city: str(product.originCity),
      end_city: str(product.endCity),
      route_labels: strList(product.route),
      key_experiences: strList(product.keyExperiences, 'name'),
      accommodation_areas: strList(product.accommodationPlan, 'area'),
      addon_types: strList(product.addOns, 'type'),
      addon_transport_destinations: strList(product.addOns, 'transportDestination'),
      itinerary_days
    };
  });
}

/**
 * Parse the PII-safe destination-intelligence subset of destinationDetailSnapshots.
 * These fields (physical_demand, difficulty_level, altitude, trail_details,
 * required_gear, permit_*, guide_required, weather_by_season, rainfall_intensity,
 * risk_factors) already exist at source and are promoted into datasets 06/07/12.
 */
function parseDestinationDetails(missing: string[]): JvtoWebDestinationDetail[] {
  let snap: { items?: unknown[] };
  try {
    snap = JSON.parse(readFileSync(DEST_DETAIL, 'utf8'));
  } catch {
    missing.push('jvto_web_destination_detail_snapshots');
    return [];
  }
  const items = Array.isArray(snap.items) ? snap.items : [];
  return items
    .map((raw): JvtoWebDestinationDetail | null => {
      const it = raw as Record<string, unknown>;
      const p = ((it.payload as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const slug = str(it.slug) ?? str(p.slug);
      if (!slug) return null;
      const risk_factors: JvtoWebRiskFactor[] = Array.isArray(p.risk_factors)
        ? (p.risk_factors as Array<Record<string, unknown>>).map((r) => ({
            type: str(r.type),
            level: str(r.level),
            mitigation: str(r.mitigation),
            description: str(r.description)
          }))
        : [];
      return {
        slug,
        destination_label: str(p.name),
        physical_demand: num(p.physical_demand),
        difficulty_level: str(p.difficulty_level),
        altitude: num(p.altitude),
        trail_details: str(p.trail_details),
        required_gear: strList(p.required_gear),
        permit_required: bool(p.permit_required),
        permit_details: str(p.permit_details),
        guide_required: bool(p.guide_required),
        weather_by_season: str(p.weather_by_season),
        rainfall_intensity: str(p.rainfall_intensity),
        risk_factors
      };
    })
    .filter((d): d is JvtoWebDestinationDetail => d !== null);
}

function trace(path: string, field: string | null = null): InventorySourceTrace {
  return { repo: REPO, path, field };
}

/**
 * Connected jvto-web extractor (Phase 2). Reuses the deterministic Prisma schema
 * parser (buildSchemaInventory) + the committed lib-packages index snapshot.
 * Lists model names by domain (no raw PII field values).
 */
export async function extractJvtoWeb(): Promise<JvtoWebExtract> {
  const missing_fields: string[] = [];
  const models = buildSchemaInventory();

  const models_by_domain: Record<string, string[]> = {};
  for (const m of models) {
    for (const tag of m.domain_tags) {
      (models_by_domain[tag] ??= []).push(m.model_name);
    }
  }
  for (const tag of Object.keys(models_by_domain)) models_by_domain[tag].sort();

  let package_helpers: JvtoWebPackageHelper[] = [];
  try {
    const idx = JSON.parse(readFileSync(LIB_INDEX, 'utf8')) as {
      files: Array<{ path: string; exports: string[] }>;
    };
    package_helpers = idx.files.map((f) => ({ path: f.path, exports: f.exports }));
  } catch {
    missing_fields.push('lib-packages.index.json');
  }

  const package_details = parsePackageDetails(missing_fields);
  const destination_details = parseDestinationDetails(missing_fields);

  const source_trace = [trace('prisma/schema.prisma', 'models'), trace('src/lib/packages/', 'package_helpers')];
  if (package_details.length) {
    source_trace.push(trace('src/lib/publicContent/generated/packageDetailSnapshots.json', 'package_details'));
  }
  if (destination_details.length) {
    source_trace.push(
      trace('src/lib/publicContent/generated/destinationDetailSnapshots.json', 'destination_details')
    );
  }

  return {
    source_mode: 'source_connected',
    generated_at: inventoryGeneratedAt(),
    status: missing_fields.length ? 'incomplete' : 'active',
    source_trace,
    manual_fields: [],
    missing_fields,
    schema_model_count: models.length,
    restricted_model_count: models.filter((m) => m.pii_class === 'restricted').length,
    models_by_domain,
    package_model_names: models_by_domain.package ?? [],
    route_model_names: models_by_domain.route ?? [],
    destination_model_names: models_by_domain.destination ?? [],
    package_helpers,
    package_detail_count: package_details.length,
    package_details,
    destination_detail_count: destination_details.length,
    destination_details
  };
}
