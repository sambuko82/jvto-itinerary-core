import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INPUT_DIR } from '../config/paths.js';
import {
  baseRecord,
  inventoryGeneratedAt,
  loadSnapshotManifest,
  type InventoryRecord
} from '../config/inventory-meta.js';

export interface SourceInventoryRecord extends InventoryRecord {
  repo: string;
  source_path: string;
  snapshot_path: string;
  file_type: string;
  role: string;
  top_level_keys: string[];
  record_count: number | null;
  package_slugs: string[];
}

function fileType(path: string): string {
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.prisma')) return 'prisma';
  if (path.endsWith('.php')) return 'php';
  return 'unknown';
}

function roleFor(sourcePath: string): string {
  if (sourcePath.includes('package-readiness')) return 'llm_wiki_package_readiness';
  if (sourcePath.endsWith('schema.prisma')) return 'jvto_web_prisma_schema';
  if (sourcePath.includes('lib/packages')) return 'jvto_web_package_helpers';
  if (sourcePath.endsWith('routes/data.php')) return 'new_backoffice_export_routes';
  if (sourcePath.includes('ExportData')) return 'new_backoffice_export_controllers';
  return 'source';
}

function inspectJson(snapshotAbs: string): { top_level_keys: string[]; record_count: number | null; slugs: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(snapshotAbs, 'utf8'));
  } catch {
    return { top_level_keys: [], record_count: null, slugs: [] };
  }
  const slugs = new Set<string>();
  const collectSlugs = (item: unknown) => {
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      if (typeof rec.slug === 'string') slugs.add(rec.slug);
      if (typeof rec.package_id === 'string') slugs.add(rec.package_id);
    }
  };
  if (Array.isArray(parsed)) {
    parsed.forEach(collectSlugs);
    const first = parsed[0];
    const keys = first && typeof first === 'object' ? Object.keys(first as object) : [];
    return { top_level_keys: ['<array>', ...keys], record_count: parsed.length, slugs: [...slugs].sort() };
  }
  if (parsed && typeof parsed === 'object') {
    return { top_level_keys: Object.keys(parsed as object), record_count: null, slugs: [] };
  }
  return { top_level_keys: [], record_count: null, slugs: [] };
}

export function buildSourceInventory(): SourceInventoryRecord[] {
  const manifest = loadSnapshotManifest();
  const generated_at = inventoryGeneratedAt(manifest);

  return manifest.files.map((f) => {
    const ftype = fileType(f.source_path || f.snapshot);
    const snapshotAbs = resolve(INPUT_DIR, f.snapshot.replace(/^input\//, ''));
    let top_level_keys: string[] = [];
    let record_count: number | null = null;
    let package_slugs: string[] = [];
    const missing_fields: string[] = [];

    if (f.snapshot.endsWith('.json')) {
      const info = inspectJson(snapshotAbs);
      top_level_keys = info.top_level_keys;
      record_count = info.record_count;
      package_slugs = info.slugs;
    } else {
      // non-JSON snapshots: structure is parsed by the dedicated schema/endpoint builders
      missing_fields.push('top_level_keys');
    }

    const id = `source__${f.repo.split('/').pop()}__${f.source_path
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')}`;

    return {
      ...baseRecord(id, [{ repo: f.repo, path: f.source_path, field: null }], {
        generated_at,
        confidence: 'high',
        status: 'active',
        missing_fields
      }),
      repo: f.repo,
      source_path: f.source_path,
      snapshot_path: f.snapshot,
      file_type: ftype,
      role: roleFor(f.source_path),
      top_level_keys,
      record_count,
      package_slugs
    };
  });
}
