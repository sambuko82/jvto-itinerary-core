import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';

const candidates = await readJson<Array<Record<string, unknown>>>(`${GENERATED_DIR}/route-source-candidates.json`);
const gaps = await readJson<Array<Record<string, unknown>>>(`${GENERATED_DIR}/route-source-gap-report.json`);

const PII_KEYS = new Set(['name', 'customer_name', 'email', 'phone', 'whatsapp', 'passport', 'booking_code']);
function assertNoPiiKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoPiiKeys(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    assert.ok(!PII_KEYS.has(k.toLowerCase()), `PII key "${k}" at ${path}`);
    assertNoPiiKeys(v, `${path}.${k}`);
  }
}

test('route-source-candidates: one per package, source-traced, jvto-web backed', () => {
  assert.equal(candidates.length, 16);
  for (const c of candidates) {
    assert.ok(Array.isArray(c.source_trace) && (c.source_trace as unknown[]).length > 0);
    assert.ok(['jvto_web_package_detail', 'llm_wiki_titles', 'slug_fallback'].includes(String(c.candidate_source)));
    assert.ok(['confirmed', 'supported', 'title_supported', 'fallback', 'unresolved'].includes(String(c.source_strength)));
  }
  // jvto-web package detail present => movement candidates derived from TravelAction
  assert.ok(candidates.some((c) => (c.movement_candidates as unknown[]).length > 0));
  assert.ok(candidates.some((c) => c.candidate_source === 'jvto_web_package_detail'));
});

test('compound phrase candidates are source-backed, not blind splits', () => {
  const withCompound = candidates.find((c) =>
    (c.compound_phrase_candidates as Array<{ node_id: string }>).some((g) => g.node_id === 'tumpak_sewu')
  );
  assert.ok(withCompound, 'expected a package with tumpak_sewu compound candidate');
});

test('taman_safari_prigen resolved via same-place TravelAction label variant', () => {
  // The TravelAction endpoint "Prigen Safari Park" → [prigen, safari] is the same place
  // as the slug-derived window "taman safari prigen". The source-backed subset match
  // upgrades it to a confirmed movement source, so it is no longer an unconfirmed
  // explicit_movement_source gap.
  assert.ok(!gaps.some((g) => String(g.token_or_node).includes('taman')), 'taman gap should be resolved');
  const taman = candidates.find((c) =>
    (c.compound_phrase_candidates as Array<{ node_id: string }>).some((g) => g.node_id === 'taman_safari_prigen')
  );
  assert.ok(taman, 'expected a package with taman_safari_prigen compound candidate');
  const node = (
    taman!.compound_phrase_candidates as Array<{ node_id: string; source_strength: string; sources: string[] }>
  ).find((g) => g.node_id === 'taman_safari_prigen')!;
  assert.equal(node.source_strength, 'confirmed');
  assert.ok(node.sources.some((s) => /travelAction/i.test(s)), 'confirmed via jvto-web travelAction');
});

test('no PII keys in candidates or gap report', () => {
  assertNoPiiKeys(candidates);
  assertNoPiiKeys(gaps);
});
