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

test('no route is a gap; no reverse/non-adjacent legs (derived map is forward-by-construction)', () => {
  for (const c of composition) {
    assert.notEqual(c.route_integrity, 'gap', `${c.package_key} is gap`);
    for (const leg of c.route_leg_refs as any[]) {
      assert.ok(
        ['forward_adjacent', 'transit', 'return_to_origin'].includes(leg.alignment),
        `${c.package_key}: leg ${leg.leg_ref} alignment ${leg.alignment}`,
      );
    }
  }
});

test('booking eligibility: effective gates on composition (only gap blocks instant book)', () => {
  for (const b of boundaries) {
    if (b.route_integrity === 'gap') assert.equal(b.effective_instant_book_eligible, false, b.package_key);
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
