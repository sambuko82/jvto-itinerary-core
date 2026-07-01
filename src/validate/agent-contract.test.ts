import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AC = join(ROOT, 'generated', 'itinerary-intelligence', 'agent-contract');
const rj = (name: string) => JSON.parse(readFileSync(join(AC, name), 'utf8'));

const composition = rj('package-operational-composition.json') as any[];
const boundaries = rj('package-customization-boundaries.json') as any[];
const catalog = JSON.parse(
  readFileSync(join(ROOT, 'generated', 'itinerary-intelligence', 'package-catalog-index.json'), 'utf8'),
) as any[];

function canonDests(tokens: string[]): string[] {
  const ts = new Set(tokens);
  const out: string[] = [];
  for (const k of ['bromo', 'ijen', 'madakaripura', 'papuma', 'malang']) if (ts.has(k)) out.push(k);
  if (ts.has('tumpak') && ts.has('sewu')) out.push('tumpak_sewu');
  if (ts.has('taman') && ts.has('safari')) out.push('taman_safari_prigen');
  return out;
}
const SEQ_TERM: Record<string, string> = {
  bromo: 'bromo', ijen: 'ijen', madakaripura: 'madakaripura', papuma: 'papuma',
  malang: 'malang', tumpak_sewu: 'tumpak sewu', taman_safari_prigen: 'taman safari',
};

test('every sold destination is routed (Papuma & Taman Safari included)', () => {
  const compByKey = Object.fromEntries(composition.map((c) => [c.package_key, c]));
  for (const cat of catalog) {
    const c = compByKey[cat.package_id];
    assert.ok(c, `missing composition for ${cat.package_id}`);
    const seq = (c.route_sequence as string[]).join(' || ').toLowerCase();
    for (const dk of canonDests(cat.destination_tokens)) {
      assert.ok(seq.includes(SEQ_TERM[dk]), `${cat.package_id}: ${dk} missing from route_sequence`);
    }
    assert.deepEqual(c.route_review_flags.destinations_missing_from_route ?? [], [],
      `${cat.package_id}: destinations_missing not empty`);
  }
});

test('no route is a gap; reverse/non-adjacent/off-sequence legs force needs_review', () => {
  const VALID = ['forward_adjacent', 'transit', 'return_to_origin', 'reverse_adjacent', 'non_adjacent', 'off_sequence'];
  for (const c of composition) {
    assert.notEqual(c.route_integrity, 'gap', `${c.package_key} is gap`);
    let flagged = false;
    for (const leg of c.route_leg_refs as any[]) {
      assert.ok(VALID.includes(leg.alignment), `${c.package_key}: bad alignment ${leg.alignment}`);
      if (['reverse_adjacent', 'non_adjacent', 'off_sequence'].includes(leg.alignment)) flagged = true;
    }
    // a leg that disagrees with the sequence must not leave the package marked clean
    if (flagged) assert.equal(c.route_integrity, 'needs_review', `${c.package_key} has a flagged leg but is ${c.route_integrity}`);
  }
});

test('a routable package with no standard endpoints is not instant-bookable', () => {
  for (const b of boundaries) {
    if (b.route_integrity !== 'gap' && (b.standard_endpoints ?? []).length === 0) {
      assert.equal(b.effective_instant_book_eligible, false, `${b.package_key} bookable with no endpoints`);
      assert.equal(b.instant_book_gated_reason, 'no_standard_endpoints', b.package_key);
    }
  }
});

test('booking eligibility: effective gates on composition gap OR missing endpoints', () => {
  for (const b of boundaries) {
    const blocked = b.route_integrity === 'gap' || (b.standard_endpoints ?? []).length === 0;
    if (blocked) assert.equal(b.effective_instant_book_eligible, false, b.package_key);
    else assert.equal(b.effective_instant_book_eligible, Boolean(b.instant_book_eligible), b.package_key);
  }
});

test('no cost / vendor / PII keys, no rupiah-scale numbers anywhere in agent-contract', () => {
  const banned = /(^|_)(rate|cost|price|idr|margin|vendor|supplier|hotel_id|room_type|backoffice_observed|actuals|list_price|net|wholesale)(_|$)/i;
  const files = ['package-operational-composition.json', 'route-validation-rules.json',
    'pickup-dropoff-requirements.json', 'destination-operational-overlays.json',
    'staging-logic.json', 'package-customization-boundaries.json',
    'operational-readiness.json', 'manifest.json'];
  const walk = (n: any, path: string, f: string) => {
    if (Array.isArray(n)) n.forEach((v, i) => walk(v, `${path}[${i}]`, f));
    else if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) {
      assert.ok(!banned.test(k), `${f}: banned key ${k} @ ${path}`);
      walk(v, `${path}.${k}`, f);
    } else if (typeof n === 'number' && Number.isInteger(n)) {
      assert.ok(n < 100000, `${f}: rupiah-scale int ${n} @ ${path}`);
    } else if (typeof n === 'string') {
      assert.ok(!/\bIDR\b/.test(n) && !/\d{6,}/.test(n), `${f}: amount string @ ${path}`);
    }
  };
  for (const f of files) walk(rj(f), '', f);
});

test('generator is deterministic and committed output is not stale', () => {
  const snap = readFileSync(join(AC, 'package-operational-composition.json'), 'utf8');
  execFileSync('node', [join(ROOT, 'scripts', 'build-agent-contract.mjs')], { cwd: ROOT, stdio: 'ignore' });
  const regen = readFileSync(join(AC, 'package-operational-composition.json'), 'utf8');
  assert.equal(regen, snap, 'committed agent-contract differs from generator output (stale or non-deterministic)');
});

test('legacy Papuma-family rows include Papuma in route_sequence/route_legs (codex P1)', () => {
  const legacy = JSON.parse(
    readFileSync(join(ROOT, 'generated', 'itinerary-intelligence', '11-package-route-map.json'), 'utf8'),
  ) as any[];
  const papumaFamily = [
    'ijen-papuma-tumpak-sewu-bromo-4d3n', 'ijen-papuma-tumpak-sewu-bromo-5d4n',
    'ijen-papuma-tumpak-sewu-bromo-malang-6d5n', 'ijen-papuma-tumpak-sewu-bromo-4d3n-bali',
    'ijen-papuma-tumpak-sewu-bromo-5d4n-bali',
  ];
  for (const pid of papumaFamily) {
    const row = legacy.find((r) => r.package_id === pid);
    assert.ok(row, `missing legacy row for ${pid}`);
    assert.ok(row.route_sequence.some((s: string) => /papuma/i.test(s)), `${pid}: Papuma missing from legacy route_sequence`);
    assert.ok(row.route_legs.includes('ijen_area_to_papuma'), `${pid}: missing ijen_area_to_papuma leg`);
    assert.ok(row.route_legs.includes('papuma_to_tumpak_sewu_area'), `${pid}: missing papuma_to_tumpak_sewu_area leg`);
  }
});

test('a plain Ketapang-only endpoint is not classified as a Bali crossing (codex P2)', () => {
  const routeTruth = rj('standard-route-truth.json');
  const ijen2d1n = routeTruth.packages.find((p: any) => p.package_key === 'ijen-2d1n');
  assert.equal(ijen2d1n.bali_transfer.crosses_boundary, false);
  assert.equal(ijen2d1n.bali_transfer.direction, 'none');
  // a package that explicitly offers a Bali/Gilimanuk continuation still crosses
  const withBaliOption = routeTruth.packages.find((p: any) => p.package_key === 'tumpak-sewu-bromo-ijen-4d3n');
  assert.equal(withBaliOption.bali_transfer.crosses_boundary, true);
  assert.equal(withBaliOption.bali_transfer.direction, 'to_bali');
});
