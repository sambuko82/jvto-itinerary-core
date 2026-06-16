import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { buildExtractionManifest } from '../compile/build-extraction-manifest.js';
import type { ExtractionManifest, LlmWikiExtract, JvtoWebExtract } from './extractTypes.js';

const manifest = await readJson<ExtractionManifest>(`${GENERATED_DIR}/extraction-manifest.json`);
const llmWiki = await readJson<LlmWikiExtract>(`${GENERATED_DIR}/extract-llm-wiki.json`);
const jvtoWeb = await readJson<JvtoWebExtract>(`${GENERATED_DIR}/extract-jvto-web.json`);

const PII_KEYS = new Set([
  'name', 'full_name', 'customer_name', 'email', 'phone', 'mobile', 'whatsapp',
  'passport', 'contact_name', 'contact_phone', 'booking_code', 'password', 'account_number'
]);
function assertNoPiiKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoPiiKeys(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    assert.ok(!PII_KEYS.has(k.toLowerCase()), `PII key "${k}" at ${path}`);
    assertNoPiiKeys(v, `${path}.${k}`);
  }
}

test('source_mode is no longer manual_seed_mvp at the extraction layer', () => {
  assert.equal(manifest.source_mode, 'source_connected');
  assert.equal(manifest.legacy_dataset_mode, 'manual_seed_mvp');
});

test('all three extractors are connected', () => {
  assert.equal(manifest.extractors.length, 3);
  for (const e of manifest.extractors) {
    assert.equal(e.connected, true, `${e.extractor} not connected`);
    assert.ok(e.source_trace.length > 0, `${e.extractor} missing source_trace`);
    assert.ok(Array.isArray(e.missing_fields));
  }
  assert.equal(manifest.status, 'active');
});

test('llm-wiki extract is normalized with source_trace and 16 packages', () => {
  assert.equal(llmWiki.source_mode, 'source_connected');
  assert.equal(llmWiki.packages.length, 16);
  assert.equal(llmWiki.pricing.length, 16);
  assert.equal(llmWiki.itineraries.length, 16);
  assert.equal(llmWiki.booking_compatibility.length, 16);
  assert.ok(llmWiki.source_trace.every((t) => t.repo === 'sambuko82/llm-wiki' && t.path));
  assert.ok(llmWiki.packages.some((p) => p.slug === 'bromo-ijen-3d2n'));
});

test('jvto-web extract reuses schema parser (106 models) + lib helpers', () => {
  assert.equal(jvtoWeb.schema_model_count, 106);
  assert.ok(jvtoWeb.restricted_model_count > 0);
  assert.ok(jvtoWeb.package_model_names.includes('packages'));
  assert.ok(jvtoWeb.destination_model_names.includes('destinations'));
  assert.equal(jvtoWeb.package_helpers.length, 2);
  assert.ok(jvtoWeb.source_trace.length > 0);
});

test('extraction outputs contain no PII keys', () => {
  assertNoPiiKeys(manifest);
  assertNoPiiKeys(llmWiki);
  assertNoPiiKeys(jvtoWeb);
});

test('extraction is deterministic (same manifest on rebuild)', async () => {
  const a = await buildExtractionManifest();
  const b = await buildExtractionManifest();
  assert.deepEqual(a.manifest, b.manifest);
  assert.equal(a.manifest.generated_at, manifest.generated_at);
});
