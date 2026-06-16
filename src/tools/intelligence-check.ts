/**
 * Itinerary Intelligence readiness check.
 *
 * One command — `npm run intelligence:check` — that answers a single question:
 * is the MVP healthy? It verifies, with real command output and JSON checks,
 * the full chain the project guards (ADR-0001):
 *
 *   required generated datasets exist
 *   scenario evaluator files exist
 *   ADR guardrail files exist
 *   typecheck passes
 *   tests pass
 *   canonical scenario CLI runs and returns possible_with_warning
 *   cost_components are IDs only (no numeric pricing)
 *   source_trace present at dataset/category level for emitted outputs
 *   no PII fields in scenario output
 *
 * Node standard library only. Read-only: it runs existing scripts/CLI and
 * inspects outputs; it changes no product behavior and refactors nothing.
 * Exit code 0 = all green, 1 = at least one failed check.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GENERATED_DIR, SAMPLES_DIR } from '../config/paths.js';

const CANONICAL_SCENARIO = `${SAMPLES_DIR}/customer-scenario-surabaya-airport-late-bromo-ijen-ketapang.json`;

const REQUIRED_DATASETS = [
  '01-pickup-contexts.json', '02-dropoff-contexts.json', '03-time-window-rules.json',
  '04-route-leg-index.json', '05-road-situation-profiles.json', '06-destination-activity-profiles.json',
  '07-operational-events.json', '08-meal-logic.json', '09-accommodation-logic.json',
  '10-cost-components.json', '11-package-route-map.json', '12-recommendation-rules.json',
  '13-visual-map-layer.json', '14-output-template-map.json', '15-scenario-preview-sample.json',
  'manifest.json'
];

const EVALUATOR_FILES = ['src/scenario/evaluateScenario.ts'];
const ADR_FILES = [
  'docs/adr/0001-scenario-evaluator-engine.md',
  'docs/adr/0001-scenario-evaluator-pr-checklist.md'
];

// emitted-id field -> every dataset category that drives it and so must appear
// in source_trace. cost_components is driven by destination profiles (06) and
// operational events (07) as well as the cost catalog (10) — see
// evaluateScenario.ts (prof.cost_components / ev.cost_components) — so all three
// are required; tying it to 10 alone would report green if the evaluator dropped
// the 06/07 trace, the false positive ADR-0001's dataset-category contract forbids.
const EMITTED_ID_DATASETS: Record<string, string[]> = {
  route_leg_ids: ['04-route-leg-index'],
  operational_events: ['07-operational-events'],
  meal_logic: ['08-meal-logic'],
  accommodation_logic: ['09-accommodation-logic'],
  cost_components: ['10-cost-components', '06-destination-activity-profiles', '07-operational-events']
};

// numeric pricing keys that must never appear on the evaluator output contract.
const PRICING_KEYS = ['unit_price', 'subtotal', 'estimated_total_cost', 'rate_idr', 'price', 'total_idr', 'amount'];
const PII_KEYS = new Set([
  'customer_name', 'email', 'phone', 'whatsapp', 'passport',
  'name', 'full_name', 'guest_name', 'phone_number', 'mobile',
  'whatsapp_number', 'passport_number', 'contact_name', 'contact_phone'
]);

interface Check { name: string; ok: boolean; detail: string }
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

function filesExist(label: string, files: string[], baseDir = '.'): void {
  const missing = files.filter((f) => !existsSync(resolve(baseDir, f)));
  add(label, missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : `all ${files.length} present`);
}

function runScript(label: string, args: string[], parse?: (out: string) => string): void {
  try {
    const out = execFileSync('npm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    add(label, true, parse ? parse(out) : 'passed');
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    const tail = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').slice(-4).join(' | ');
    add(label, false, `failed: ${tail || (err as Error).message}`);
  }
}

function scanKeys(value: unknown, predicate: (key: string, val: unknown) => boolean, path = '$'): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...scanKeys(v, predicate, `${path}[${i}]`)));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (predicate(k, v)) hits.push(`${path}.${k}`);
      hits.push(...scanKeys(v, predicate, `${path}.${k}`));
    }
  }
  return hits;
}

function main(): void {
  // 1-3: structural presence
  filesExist('generated datasets exist', REQUIRED_DATASETS.map((f) => `${GENERATED_DIR}/${f}`));
  filesExist('scenario evaluator files exist', EVALUATOR_FILES);
  filesExist('ADR guardrail files exist', ADR_FILES);

  // Authoritative generated-data gate: schema/PII/joinability over every numbered
  // dataset. existsSync above and the test list do not cover datasets the scenario
  // tests never read (13/14/15/manifest), so a malformed/PII-violating file would
  // otherwise report green. `npm run validate` exits non-zero on critical errors.
  runScript('generated data passes validation', ['run', 'validate'], (out) => {
    const files = out.match(/"generated_files":\s*(\d+)/)?.[1] ?? '?';
    if (!/"ok":\s*true/.test(out)) throw new Error('validateGeneratedData reported not ok');
    return `ok, ${files} generated files (schema/PII/joinability)`;
  });

  // 4-5: typecheck + tests (real subprocess exit codes)
  runScript('typecheck passes', ['run', 'typecheck']);
  runScript('tests pass', ['test'], (out) => {
    const pass = out.match(/# pass (\d+)/)?.[1] ?? '?';
    const fail = out.match(/# fail (\d+)/)?.[1] ?? '?';
    if (fail !== '0') throw new Error(`${fail} failing tests`);
    return `${pass} pass / ${fail} fail`;
  });

  // 6: canonical scenario CLI runs -> capture JSON
  let scenario: Record<string, unknown> | null = null;
  try {
    const out = execFileSync('npx', ['tsx', 'src/cli.ts', 'scenario', CANONICAL_SCENARIO], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    scenario = JSON.parse(out.slice(out.indexOf('{')));
    add('canonical scenario CLI runs', true, 'CLI emitted parseable JSON');
  } catch (err) {
    add('canonical scenario CLI runs', false, `failed: ${(err as Error).message}`);
  }

  if (scenario) {
    const s = scenario;
    // 7: status
    add('status is possible_with_warning', s.status === 'possible_with_warning', `status=${String(s.status)}`);

    // 8: cost_components are IDs only
    const cc = Array.isArray(s.cost_components) ? (s.cost_components as unknown[]) : [];
    const idsOnly = cc.length > 0 && cc.every((x) => typeof x === 'string' && !/\d/.test(x));
    add('cost_components are IDs only', idsOnly, `${cc.length} components, all string IDs without digits=${idsOnly}`);

    // 9: no numeric pricing fields anywhere in the scenario output
    const priceHits = scanKeys(s, (k, v) => PRICING_KEYS.includes(k.toLowerCase()) && typeof v === 'number');
    add('no numeric pricing fields', priceHits.length === 0, priceHits.length ? `found: ${priceHits.join(', ')}` : 'none');

    // 10: source_trace covers the dataset categories for emitted outputs
    const traceRefs = Array.isArray(s.source_trace)
      ? (s.source_trace as Array<{ ref?: string }>).map((t) => String(t.ref ?? '')).join(' ')
      : '';
    const uncovered = Object.entries(EMITTED_ID_DATASETS)
      .filter(([field]) => Array.isArray(s[field]) && (s[field] as unknown[]).length > 0)
      .flatMap(([field, datasets]) =>
        datasets.filter((ds) => !traceRefs.includes(ds)).map((ds) => `${field}->${ds}`));
    add('source_trace covers emitted dataset categories',
      Array.isArray(s.source_trace) && s.source_trace.length > 0 && uncovered.length === 0,
      uncovered.length ? `uncovered: ${uncovered.join(', ')}` : `${(s.source_trace as unknown[]).length} dataset refs cover all emitted categories`);

    // 11: no PII fields
    const piiHits = scanKeys(s, (k) => PII_KEYS.has(k.toLowerCase()));
    add('no PII fields in scenario output', piiHits.length === 0, piiHits.length ? `found: ${piiHits.join(', ')}` : 'none');
  }

  // ── report ──
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`);
  }
  const summary = {
    ok: failed.length === 0,
    checks_total: checks.length,
    checks_passed: checks.length - failed.length,
    checks_failed: failed.length,
    failed: failed.map((c) => c.name)
  };
  console.log('\n' + JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main();
