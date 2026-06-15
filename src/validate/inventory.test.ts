import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { validateItineraryIntelligence } from './validate-itinerary-intelligence.js';
import { INVENTORY_SCHEMA_VERSION } from '../config/inventory-meta.js';

const source = await readJson<Array<Record<string, unknown>>>(`${GENERATED_DIR}/source-inventory.json`);
const schema = await readJson<Array<Record<string, unknown>>>(`${GENERATED_DIR}/schema-inventory.json`);
const endpoints = await readJson<Array<Record<string, unknown>>>(`${GENERATED_DIR}/export-endpoint-inventory.json`);

const PII_KEYS = new Set([
  'name', 'full_name', 'customer_name', 'guest_name', 'email', 'phone', 'mobile',
  'whatsapp', 'passport', 'contact_name', 'contact_phone', 'booking_code', 'booking_id',
  'ticket_number', 'password', 'account_number'
]);

function assertNoPiiKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoPiiKeys(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    assert.ok(!PII_KEYS.has(k.toLowerCase()), `PII key "${k}" at ${path}`);
    assertNoPiiKeys(v, `${path}.${k}`);
  }
}

test('inventory counts match the committed source snapshots (deterministic)', () => {
  assert.equal(source.length, 10);
  assert.equal(schema.length, 106);
  assert.equal(endpoints.length, 63);
});

test('every inventory record satisfies the source_trace contract', () => {
  for (const rec of [...source, ...schema, ...endpoints]) {
    assert.equal(typeof rec.id, 'string');
    assert.equal(rec.schema_version, INVENTORY_SCHEMA_VERSION);
    assert.ok(Array.isArray(rec.source_trace) && (rec.source_trace as unknown[]).length > 0, `no source_trace on ${rec.id}`);
    for (const t of rec.source_trace as Array<Record<string, unknown>>) {
      assert.equal(typeof t.repo, 'string');
      assert.equal(typeof t.path, 'string');
      assert.ok('field' in t);
    }
    assert.ok(['high', 'medium', 'low'].includes(String(rec.confidence)));
    assert.ok(['active', 'incomplete', 'deprecated'].includes(String(rec.status)));
    assert.match(String(rec.generated_at), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.ok(Array.isArray(rec.manual_fields));
    assert.ok(Array.isArray(rec.missing_fields));
  }
});

test('generated_at is the deterministic snapshot timestamp', () => {
  for (const rec of [...source, ...schema, ...endpoints]) {
    assert.equal(rec.generated_at, '2026-06-15T00:00:00Z');
  }
});

test('all 106 Prisma models listed with field metadata', () => {
  assert.ok(schema.every((m) => typeof m.model_name === 'string'));
  assert.ok(schema.some((m) => m.model_name === 'packages'));
  assert.ok(schema.some((m) => m.model_name === 'destinations'));
  // restricted PII models flagged + excluded
  const restricted = schema.filter((m) => m.pii_class === 'restricted');
  assert.ok(restricted.length > 0);
  for (const m of restricted) assert.equal(m.excluded_from_extraction, true);
});

test('all 63 export endpoints listed; itinerary-core bundle is PII-open, bookings restricted', () => {
  const bundle = endpoints.find((e) => e.path === '/export-data/itinerary-core/bundle');
  assert.ok(bundle);
  assert.equal(bundle.pii_class, 'open');
  assert.equal(bundle.excluded_from_extraction, false);

  const bookings = endpoints.filter((e) => e.controller === 'ExportDataBookings');
  assert.ok(bookings.length > 0);
  for (const b of bookings) {
    assert.equal(b.pii_class, 'restricted');
    assert.equal(b.excluded_from_extraction, true);
  }
  const customers = endpoints.find((e) => e.path === '/export-data/customers/customers');
  assert.equal(customers?.pii_class, 'restricted');
});

test('no PII keys anywhere in the inventories', () => {
  assertNoPiiKeys(source);
  assertNoPiiKeys(schema);
  assertNoPiiKeys(endpoints);
});

test('package slugs are present and consistent (no cross-repo conflict)', () => {
  const slugs = new Set<string>();
  for (const rec of source) for (const s of (rec.package_slugs as string[] | undefined) ?? []) slugs.add(s);
  assert.ok(slugs.has('bromo-ijen-3d2n'));
  assert.ok(slugs.size >= 12);
});

test('validation-report shows 0 critical errors and pass status', async () => {
  const report = await validateItineraryIntelligence();
  assert.equal(report.summary.critical, 0);
  assert.equal(report.status, 'pass');
});
