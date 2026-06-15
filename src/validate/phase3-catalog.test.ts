import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { validateItineraryIntelligence } from './validate-itinerary-intelligence.js';

const catalog = await readJson<Array<Record<string, unknown>>>(`${GENERATED_DIR}/package-catalog-index.json`);
const nodes = await readJson<Array<Record<string, unknown>>>(`${GENERATED_DIR}/route-node-index.json`);
const aliases = await readJson<Array<Record<string, unknown>>>(`${GENERATED_DIR}/location-alias-registry.json`);
const extract = await readJson<{ packages: unknown[] }>(`${GENERATED_DIR}/extract-llm-wiki.json`);

const PII_KEYS = new Set(['name', 'full_name', 'customer_name', 'email', 'phone', 'whatsapp', 'passport', 'booking_code', 'password']);
function assertNoPiiKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoPiiKeys(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    assert.ok(!PII_KEYS.has(k.toLowerCase()), `PII key "${k}" at ${path}`);
    assertNoPiiKeys(v, `${path}.${k}`);
  }
}

test('all extracted packages are mapped into the catalog (unique ids/keys)', () => {
  assert.equal(catalog.length, extract.packages.length);
  assert.equal(catalog.length, 16);
  const ids = catalog.map((c) => c.package_id);
  const keys = catalog.map((c) => c.catalog_key);
  assert.equal(new Set(ids).size, ids.length, 'package_id must be unique');
  assert.equal(new Set(keys).size, keys.length, 'catalog_key (origin/slug) must be unique');
  for (const c of catalog) {
    assert.ok(Array.isArray(c.source_trace) && (c.source_trace as unknown[]).length > 0);
    assert.ok(Array.isArray(c.destination_tokens));
  }
});

test('route nodes derived only from source refs, no duplicate ids, geo not guessed', () => {
  const ids = nodes.map((n) => n.node_id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate node ids');
  // origins discovered from package.origin
  assert.ok(nodes.some((n) => n.node_id === 'surabaya' && (n.node_roles as string[]).includes('origin')));
  assert.ok(nodes.some((n) => n.node_id === 'bali' && (n.node_roles as string[]).includes('origin')));
  // standalone destination tokens are high-confidence
  const bromo = nodes.find((n) => n.node_id === 'bromo');
  assert.ok(bromo);
  assert.equal(bromo.standalone_destination, true);
  assert.equal(bromo.ambiguous, false);
  // geo never guessed
  for (const n of nodes) {
    assert.equal(n.geo, null);
    assert.ok((n.missing_fields as string[]).includes('geo'));
    assert.ok(Array.isArray(n.source_trace) && (n.source_trace as unknown[]).length > 0);
  }
});

test('compound/non-standalone tokens are flagged ambiguous, not merged or guessed', () => {
  const ambiguous = nodes.filter((n) => n.ambiguous === true).map((n) => n.node_id);
  assert.ok(ambiguous.includes('tumpak'));
  assert.ok(ambiguous.includes('sewu'));
  for (const n of nodes) {
    if (n.ambiguous) assert.ok((n.missing_fields as string[]).includes('canonical_confirmation'));
  }
});

test('aliases come only from source spellings', () => {
  assert.equal(aliases.length, nodes.length);
  const surabaya = aliases.find((a) => a.node_id === 'surabaya');
  assert.ok(surabaya);
  assert.deepEqual((surabaya.aliases as string[]).sort(), ['from-surabaya', 'surabaya']);
  for (const a of aliases) {
    assert.equal(a.geo, null);
    assert.ok(Array.isArray(a.source_trace) && (a.source_trace as unknown[]).length > 0);
  }
});

test('no PII keys in any Phase 3 output', () => {
  assertNoPiiKeys(catalog);
  assertNoPiiKeys(nodes);
  assertNoPiiKeys(aliases);
});

test('validation-report has 0 critical errors (ambiguity is low, not critical)', async () => {
  const report = await validateItineraryIntelligence();
  assert.equal(report.summary.critical, 0);
  assert.equal(report.status, 'pass');
  assert.ok(report.findings.some((f) => f.check === 'ambiguous_location_token'));
});
