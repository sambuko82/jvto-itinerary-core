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
    'operational-readiness.json', 'manifest.json', 'standard-route-truth.json'];
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

test('Bali pickup is a real 01-pickup-contexts.json record, not a synthesized gap', () => {
  const pickups = JSON.parse(readFileSync(join(ROOT, 'generated', 'itinerary-intelligence', '01-pickup-contexts.json'), 'utf8')) as any[];
  const ctx = pickups.find((p) => p.id === 'bali_hotel_pickup');
  assert.ok(ctx, 'bali_hotel_pickup context missing from 01-pickup-contexts.json');
  assert.equal(ctx.location_group, 'Bali');

  const routeTruth = rj('standard-route-truth.json');
  for (const key of ['bali/bromo-ijen-3d2n', 'bali/ijen-bromo-madakaripura-3d2n', 'bali/ijen-papuma-tumpak-sewu-bromo-4d3n', 'bali/ijen-papuma-tumpak-sewu-bromo-5d4n']) {
    const pkg = routeTruth.packages.find((p: any) => p.package_key === key);
    const pickup = pkg.valid_pickups.find((p: any) => p.type === 'hotel');
    assert.equal(pickup.location_ref, 'bali_hotel_pickup', `${key}: pickup location_ref should resolve to the real context, not null`);
    assert.equal(pickup.classification, 'final_jvto_standard');
  }
  // the previously-recorded "no bali_hotel_pickup context" gap must be gone now that it exists
  assert.ok(!routeTruth.gaps.some((g: any) => g.field === 'pickup_context'), 'stale pickup_context gap should be resolved, not left stale');
});

test('Madakaripura route-leg conflict is a complete, non-invented missing_data record (2 packages)', () => {
  const manifest = rj('manifest.json');
  const affected = ['bali/bromo-ijen-3d2n', 'bromo-2d1n'];
  for (const key of affected) {
    const g = manifest.composition_gaps.find((x: any) => x.package_key === key);
    assert.ok(g, `missing composition_gaps entry for ${key}`);
    assert.ok(g.missing_data, `${key}: composition gap has no structured missing_data record`);
    for (const field of ['field', 'affected', 'required_source', 'current_fallback', 'gating']) {
      assert.ok(g.missing_data[field], `${key}: missing_data.${field} should be populated`);
    }
    assert.equal(g.missing_data.gating, 'warns');
  }
  // this is a source conflict (jvto-web TravelActions vs llm-wiki destination_tokens), not a bug:
  // it must not silently block instant-book (needs_review only warns, 'gap' blocks).
  const boundaries = rj('package-customization-boundaries.json');
  for (const key of affected) {
    const b = boundaries.find((x: any) => x.package_key === key);
    assert.equal(b.route_integrity, 'needs_review');
    assert.equal(b.effective_instant_book_eligible, true, `${key}: needs_review must not block instant-book (only integrity=gap does)`);
  }
});

test('malang_batu destination_intelligence absence is a complete missing_data record, not a silent null', () => {
  const routeTruth = rj('standard-route-truth.json');
  const affected = ['ijen-bromo-madakaripura-malang-5d4n', 'ijen-papuma-tumpak-sewu-bromo-malang-6d5n'];
  for (const key of affected) {
    const g = routeTruth.gaps.find((x: any) => x.package_key === key && x.field.includes('malang_batu'));
    assert.ok(g, `missing malang_batu gap entry for ${key}`);
    for (const field of ['required_source', 'current_fallback', 'gating']) assert.ok(g[field], `${key}: gap.${field} should be populated`);
    assert.equal(g.gating, 'optional', 'a descriptive-only gap must not block booking');

    const pkg = routeTruth.packages.find((p: any) => p.package_key === key);
    const malang = pkg.destinations.find((d: any) => d.destination === 'malang_batu');
    assert.equal(malang.difficulty_level.classification, 'absent');
    // fatigue_score/activity_window must still be populated even though difficulty is absent
    assert.ok(malang.fatigue_score.value != null, `${key}: fatigue_score should still be populated from 06`);
  }
});

test('12-recommendation-rules.json package/route rules now reach route-validation-rules.json (previously CLI-only)', () => {
  const rvRules = rj('route-validation-rules.json') as any[];
  const projected = ['avoid_backtracking_ijen_bromo_ketapang', 'ferry_bali_buffer_required', 'ijen_access_closure_risk', 'tight_multi_destination_short_days'];
  for (const id of projected) {
    const r = rvRules.find((x) => x.rule_id === id);
    assert.ok(r, `rule ${id} from 12-recommendation-rules.json missing from route-validation-rules.json`);
    assert.deepEqual(r.source_refs, ['12-recommendation-rules.json']);
  }
  // per-destination weather advisories are NOT duplicated here (they land on destinations instead)
  assert.ok(!rvRules.some((r) => r.rule_id.endsWith('_weather_risk_advisory')), 'weather advisories should not be duplicated into route-validation-rules.json');
});

test('Ijen access-risk advisory is redacted of rate figures before reaching the agent-contract', () => {
  const rvRules = rj('route-validation-rules.json') as any[];
  const r = rvRules.find((x) => x.rule_id === 'ijen_access_closure_risk');
  assert.ok(r.recommendation.includes('daily visitor cap'), 'operational fact should survive redaction');
  assert.ok(!/\bIDR\b/.test(r.recommendation), 'rate figure must be redacted from the agent-contract');

  const routeTruth = rj('standard-route-truth.json');
  const ijenPkg = routeTruth.packages.find((p: any) => p.package_key === 'ijen-2d1n');
  const rec = ijenPkg.route_recommendations.find((x: any) => x.rule_id === 'ijen_access_closure_risk');
  assert.ok(rec, 'ijen-2d1n should carry the ijen_access_closure_risk recommendation (destinations includes ijen)');
  assert.ok(!/\bIDR\b/.test(rec.note), 'rate figure must be redacted from standard-route-truth.json too');
});

test('package-level route_recommendations are condition-matched against real package data, not blanket-applied', () => {
  const routeTruth = rj('standard-route-truth.json');
  // Ketapang/Bali-continuing package with both Bromo+Ijen in the recommended order: compliant, not a live warning
  const compliant = routeTruth.packages.find((p: any) => p.package_key === 'tumpak-sewu-bromo-ijen-4d3n');
  const backtrack = compliant.route_recommendations.find((r: any) => r.rule_id === 'avoid_backtracking_ijen_bromo_ketapang');
  assert.equal(backtrack.classification, 'final_jvto_standard');
  assert.ok(compliant.route_recommendations.some((r: any) => r.rule_id === 'ferry_bali_buffer_required'));

  // a Surabaya-only package with no Ketapang/Bali endpoint must NOT get the ferry-buffer recommendation
  const noFerry = routeTruth.packages.find((p: any) => p.package_key === 'bromo-1d1n');
  assert.ok(!noFerry.route_recommendations.some((r: any) => r.rule_id === 'ferry_bali_buffer_required'), 'bromo-1d1n never touches Ketapang/Bali; must not carry the ferry-buffer recommendation');
  assert.ok(!noFerry.route_recommendations.some((r: any) => r.rule_id === 'ijen_access_closure_risk'), 'bromo-1d1n has no Ijen destination; must not carry the Ijen access-risk recommendation');

  // tight_multi_destination_short_days correctly applies to none of the 16 (honest empty result)
  assert.ok(!routeTruth.packages.some((p: any) => p.route_recommendations.some((r: any) => r.rule_id === 'tight_multi_destination_short_days')),
    'no current package genuinely has 3+ destinations in <=2 days; the rule should not fire anywhere');
});

test('destination weather advisories are attached per-destination, absent only where jvto-web has no page (malang_batu)', () => {
  const routeTruth = rj('standard-route-truth.json');
  const bromoPkg = routeTruth.packages.find((p: any) => p.package_key === 'bromo-1d1n');
  const bromo = bromoPkg.destinations.find((d: any) => d.destination === 'bromo');
  assert.equal(bromo.weather_advisory.classification, 'live_condition');
  assert.ok(bromo.weather_advisory.value.includes('season'));

  const malangPkg = routeTruth.packages.find((p: any) => p.package_key === 'ijen-bromo-madakaripura-malang-5d4n');
  const malang = malangPkg.destinations.find((d: any) => d.destination === 'malang_batu');
  assert.equal(malang.weather_advisory.classification, 'absent');
});

test('the stale used_by_packages reference on the null-duration Bali leg is corrected', () => {
  const legs = JSON.parse(readFileSync(join(ROOT, 'generated', 'itinerary-intelligence', '04-route-leg-index.json'), 'utf8')) as any[];
  const leg = legs.find((l) => l.id === 'bali_hotel_area_to_banyuwangi_ijen_area');
  assert.ok(!leg.used_by_packages.includes('bali-ijen-bromo-surabaya'), 'stale non-existent package_id should be removed');
  for (const pid of ['bromo-ijen-3d2n-bali', 'ijen-bromo-madakaripura-3d2n-bali', 'ijen-papuma-tumpak-sewu-bromo-4d3n-bali', 'ijen-papuma-tumpak-sewu-bromo-5d4n-bali']) {
    assert.ok(leg.used_by_packages.includes(pid), `used_by_packages should include the real referencing package ${pid}`);
  }
  // the null duration itself is a deliberate do-not-invent gap; it must be tracked, not silently null
  const readiness = rj('operational-readiness.json');
  const ds = readiness.datasets.find((d: any) => d.dataset === 'legacy_route_leg_index');
  assert.ok(ds, 'legacy_route_leg_index dataset entry missing from operational-readiness.json');
  assert.equal(ds.gaps[0].gating, 'optional');
});

test('operational_movements_pending_labels are now projected (previously only the count reached agent-contract)', () => {
  const composition = rj('package-operational-composition.json') as any[];
  const r = composition.find((c) => c.package_key === 'bali/bromo-ijen-3d2n');
  assert.ok(r.operational_movements_pending > 0);
  assert.ok(Array.isArray(r.operational_movements_pending_labels) && r.operational_movements_pending_labels.length === r.operational_movements_pending);
});

test('a plain Ketapang-only dropoff does not trigger the ferry-buffer or backtracking recommendation (codex P2)', () => {
  const routeTruth = rj('standard-route-truth.json');
  const ijen2d1n = routeTruth.packages.find((p: any) => p.package_key === 'ijen-2d1n');
  assert.equal(ijen2d1n.bali_transfer.crosses_boundary, false);
  const ruleIds = ijen2d1n.route_recommendations.map((r: any) => r.rule_id);
  assert.ok(!ruleIds.includes('ferry_bali_buffer_required'), 'plain Ketapang dropoff must not trigger the ferry-buffer recommendation');

  // a genuine Bali-continuing package (offers "...with additional transfer") still gets it
  const withBali = routeTruth.packages.find((p: any) => p.package_key === 'tumpak-sewu-bromo-ijen-4d3n');
  assert.equal(withBali.bali_transfer.crosses_boundary, true);
  assert.ok(withBali.route_recommendations.some((r: any) => r.rule_id === 'ferry_bali_buffer_required'));
});

test('weather advisories carry no JVTO marketing copy or booking URLs anywhere (codex P2)', () => {
  const routeTruth = rj('standard-route-truth.json');
  const rvRules = rj('route-validation-rules.json') as any[];
  const urlPattern = /\b[a-z0-9-]+\.[a-z0-9-]+\.(org|com|id|net)\b/i;
  for (const p of routeTruth.packages) {
    for (const d of p.destinations) {
      const wx = d.weather_advisory;
      if (wx.value) {
        assert.ok(!/\bJVTO\b/i.test(wx.value), `${p.package_key}/${d.destination}: weather_advisory.value carries JVTO marketing copy`);
        assert.ok(!urlPattern.test(wx.value), `${p.package_key}/${d.destination}: weather_advisory.value carries a URL`);
      }
      for (const rf of wx.risk_factors ?? []) {
        if (rf.mitigation) assert.ok(!/\bJVTO\b/i.test(rf.mitigation), `${p.package_key}/${d.destination}: risk_factor.mitigation carries JVTO marketing copy`);
      }
    }
    for (const rec of p.route_recommendations) {
      assert.ok(!urlPattern.test(rec.note), `${p.package_key}: route_recommendations note carries a URL`);
    }
  }
  for (const r of rvRules) {
    if (r.recommendation) assert.ok(!urlPattern.test(r.recommendation), `route-validation-rules ${r.rule_id}: carries a URL`);
  }
});

test('every route-validation rule carries an applies_at consumption label derived from its trigger (no unused-by-accident metadata)', () => {
  const rvRules = rj('route-validation-rules.json') as any[];
  const REQUEST_TIME = new Set(['hotel_arrival_after', 'arrival_after', 'next_day_activity',
    'pickup_type', 'dropoff_type', 'minimum_flight_buffer_minutes', 'flight_buffer_less_than_minutes']);
  for (const r of rvRules) {
    assert.ok(['static_package_response', 'live_feasibility_request'].includes(r.applies_at), `${r.rule_id}: bad applies_at`);
    assert.ok(r.consumed_by, `${r.rule_id}: missing consumed_by`);
    // the label must MATCH the rule's own trigger — a request-time rule cannot be static
    const needsLive = (r.required_customer_fields || []).length > 0 ||
      Object.keys(r.trigger || {}).some((k) => REQUEST_TIME.has(k));
    assert.equal(r.applies_at, needsLive ? 'live_feasibility_request' : 'static_package_response',
      `${r.rule_id}: applies_at disagrees with its trigger`);
  }
  // the 2 rules the runtime actually surfaces today must be static (a live rule can't be
  // evaluated in the static response, so surfacing it there would be a bug)
  const byId = Object.fromEntries(rvRules.map((r) => [r.rule_id, r]));
  assert.equal(byId['ferry_bali_buffer_required'].applies_at, 'static_package_response');
  assert.equal(byId['ijen_access_closure_risk'].applies_at, 'static_package_response');
});

test('the Madakaripura needs_review record reflects the owner adjudication + a concrete propagation request', () => {
  const manifest = rj('manifest.json');
  for (const key of ['bali/bromo-ijen-3d2n', 'bromo-2d1n']) {
    const g = manifest.composition_gaps.find((x: any) => x.package_key === key);
    assert.ok(g.missing_data.adjudication.includes('owner_confirmed'), `${key}: adjudication not recorded`);
    assert.ok(g.missing_data.propagation_recommendation.includes('llm-wiki'), `${key}: no llm-wiki propagation request`);
    assert.ok(g.missing_data.required_source.includes('llm-wiki'), `${key}: required_source should point upstream at llm-wiki`);
  }
});
