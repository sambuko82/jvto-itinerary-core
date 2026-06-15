import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INPUT_DIR } from '../config/paths.js';
import { inventoryGeneratedAt, type InventorySourceTrace } from '../config/inventory-meta.js';
import { buildSchemaInventory } from '../compile/build-schema-inventory.js';
import type { JvtoWebExtract, JvtoWebPackageHelper } from './extractTypes.js';

const REPO = 'jvto-devteam/jvto-web';
const LIB_INDEX = resolve(INPUT_DIR, 'jvto-web/lib-packages.index.json');

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

  return {
    source_mode: 'source_connected',
    generated_at: inventoryGeneratedAt(),
    status: missing_fields.length ? 'incomplete' : 'active',
    source_trace: [
      trace('prisma/schema.prisma', 'models'),
      trace('src/lib/packages/', 'package_helpers')
    ],
    manual_fields: [],
    missing_fields,
    schema_model_count: models.length,
    restricted_model_count: models.filter((m) => m.pii_class === 'restricted').length,
    models_by_domain,
    package_model_names: models_by_domain.package ?? [],
    route_model_names: models_by_domain.route ?? [],
    destination_model_names: models_by_domain.destination ?? [],
    package_helpers
  };
}
