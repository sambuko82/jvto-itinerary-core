import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import type { ExtractionManifest } from '../extract/extractTypes.js';

interface GeneratedManifest {
  source_mode: string;
  legacy_dataset_mode: string;
  status: string;
}

const generated = await readJson<GeneratedManifest>(`${GENERATED_DIR}/manifest.json`);
const extraction = await readJson<ExtractionManifest>(`${GENERATED_DIR}/extraction-manifest.json`);

test('generated manifest source_mode is reconciled with the extraction manifest', () => {
  // The dataset pipeline is source-connected; the generated manifest must not
  // keep self-reporting the stale manual_seed_mvp source_mode (that mismatch
  // misleads downstream agents — see data-readiness source_status_consistency).
  assert.equal(generated.source_mode, 'source_connected');
  assert.equal(generated.source_mode, extraction.source_mode);
});

test('generated manifest records the seed-calibrated content via legacy_dataset_mode', () => {
  // The honest content nature is preserved, mirroring the extraction manifest,
  // so reconciliation does not overstate that all fields are verified-from-source.
  assert.equal(generated.legacy_dataset_mode, 'manual_seed_mvp');
  assert.equal(generated.legacy_dataset_mode, extraction.legacy_dataset_mode);
});
