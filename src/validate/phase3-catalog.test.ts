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
  // movement-confirmed destination is high-confidence
  const bromo = nodes.find((n) => n.node_id === 'bromo');
  assert.ok(bromo);
  assert.equal(bromo.source_strength, 'confirmed');
  assert.equal(bromo.confidence, 'high');
  assert.equal(bromo.ambiguous, false);
  // geo never guessed
  for (const n of nodes) {
    assert.equal(n.geo, null);
    assert.ok((n.missing_fields as string[]).includes('geo'));
    assert.ok(Array.isArray(n.source_trace) && (n.source_trace as unknown[]).length > 0);
  }
});

test('compound tokens merge only when source-backed (Phase 4.5)', () => {
  // tumpak+sewu merged into one node via source phrase ("Tumpak Sewu Waterfall" / TravelAction)
  const tumpakSewu = nodes.find((n) => n.node_id === 'tumpak_sewu');
  assert.ok(tumpakSewu, 'expected merged tumpak_sewu node');
  assert.deepEqual(tumpakSewu.member_tokens, ['tumpak', 'sewu']);
  assert.ok(['confirmed', 'supported'].includes(String(tumpakSewu.source_strength)));
  // raw split tokens must NOT exist as standalone nodes
  assert.ok(!nodes.some((n) => n.node_id === 'sewu'));
  // taman_safari_prigen merged from route[] label
  assert.ok(nodes.some((n) => n.node_id === 'taman_safari_prigen'));
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

test('validation-report has 0 critical errors', async () => {
  const report = await validateItineraryIntelligence();
  assert.equal(report.summary.critical, 0);
  assert.equal(report.status, 'pass');
});
