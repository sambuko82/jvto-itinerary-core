import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INPUT_DIR } from './paths.js';

/**
 * Shared metadata for the Phase 1 inventory layer.
 *
 * `generated_at` is deterministic by design: it comes from the
 * INVENTORY_GENERATED_AT env var, else the committed snapshot manifest's
 * `snapshot_generated_at`. Never Date.now() — keeps generated JSON reproducible.
 */

export const INVENTORY_SCHEMA_VERSION = 'itinerary-intelligence/inventory-v1';

const MANIFEST_PATH = resolve(INPUT_DIR, 'source-snapshot-manifest.json');
const FALLBACK_GENERATED_AT = '1970-01-01T00:00:00Z';

export interface SnapshotManifest {
  schema_version: string;
  snapshot_generated_at: string;
  repos: Record<string, { repo: string; ref: string }>;
  files: Array<{ repo: string; source_path: string; snapshot: string }>;
}

export function loadSnapshotManifest(): SnapshotManifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as SnapshotManifest;
}

export function inventoryGeneratedAt(manifest?: SnapshotManifest): string {
  const env = process.env.INVENTORY_GENERATED_AT;
  if (env && env.trim()) return env.trim();
  const m = manifest ?? loadSnapshotManifest();
  return m.snapshot_generated_at ?? FALLBACK_GENERATED_AT;
}

export type InventoryConfidence = 'high' | 'medium' | 'low';
export type InventoryStatus = 'active' | 'incomplete' | 'deprecated';

export interface InventorySourceTrace {
  repo: string;
  path: string;
  field: string | null;
}

/** The required record contract (blueprint §6). */
export interface InventoryRecord {
  id: string;
  schema_version: string;
  source_trace: InventorySourceTrace[];
  confidence: InventoryConfidence;
  generated_at: string;
  manual_fields: string[];
  missing_fields: string[];
  status: InventoryStatus;
}

/** Build the contract fields shared by every inventory record. */
export function baseRecord(
  id: string,
  source_trace: InventorySourceTrace[],
  opts: {
    generated_at: string;
    confidence?: InventoryConfidence;
    status?: InventoryStatus;
    manual_fields?: string[];
    missing_fields?: string[];
  }
): InventoryRecord {
  return {
    id,
    schema_version: INVENTORY_SCHEMA_VERSION,
    source_trace,
    confidence: opts.confidence ?? 'high',
    generated_at: opts.generated_at,
    manual_fields: opts.manual_fields ?? [],
    missing_fields: opts.missing_fields ?? [],
    status: opts.status ?? 'active'
  };
}
