// @ts-nocheck
/**
 * Itinerary Intelligence — data readiness report.
 *
 * Consolidates EXISTING generated datasets, gap reports, and source snapshots
 * into one actionable technical report. It does not invent a manual matrix and
 * it does not recompute domain data — it reads what the pipeline already
 * produced and classifies each data area as covered / partial / blocked /
 * not_started, with evidence, what-not-to-duplicate, and the exact next action.
 *
 * Read-only. Node standard library only (no deps, no evaluator/pricing changes).
 * Counts are DERIVED from files at runtime, never hardcoded as permanent truth.
 *
 * Output: generated/itinerary-intelligence/data-readiness-report.json
 * Stdout: compact per-group summary.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEN = 'generated/itinerary-intelligence';
const WIKI = 'input/llm-wiki/package-readiness';
const WEB = 'input/jvto-web';
const BO = 'input/new-backoffice';

const SCHEMA_VERSION = 'itinerary-intelligence/data-readiness-report-v1';
const STATUS = { COVERED: 'covered', PARTIAL: 'partial', BLOCKED: 'blocked', NOT_STARTED: 'not_started' };

// ── helpers ──────────────────────────────────────────────────────────────
const abs = (rel) => join(ROOT, rel);
const exists = (rel) => existsSync(abs(rel));
function readJson(rel) {
  try {
    return JSON.parse(readFileSync(abs(rel), 'utf8'));
  } catch {
    return null;
  }
}
function readText(rel) {
  try {
    return readFileSync(abs(rel), 'utf8');
  } catch {
    return null;
  }
}
const arr = (x) => (Array.isArray(x) ? x : []);

/** Build a group with the required uniform shape; extra fields are merged in. */
function group(status, fields = {}) {
  return {
    status,
    evidence: [],
    covered_items: [],
    partial_items: [],
    missing_items: [],
    source_exists_not_promoted: [],
    do_not_duplicate: [],
    next_actions: [],
    ...fields
  };
}

// ── load all inputs once ─────────────────────────────────────────────────
const extractionManifest = readJson(`${GEN}/extraction-manifest.json`);
const generatedManifest = readJson(`${GEN}/manifest.json`);
const sourceInventory = readJson(`${GEN}/source-inventory.json`);
const packageCatalog = readJson(`${GEN}/package-catalog-index.json`);
const routeGapReport = readJson(`${GEN}/route-source-gap-report.json`);
const opContextResolution = readJson(`${GEN}/operational-context-resolution-report.json`);
const routeNodeReview = readJson(`${GEN}/route-node-candidate-review.json`);
const costComponents = readJson(`${GEN}/10-cost-components.json`);
const operationalEvents = readJson(`${GEN}/07-operational-events.json`);
const destProfiles = readJson(`${GEN}/06-destination-activity-profiles.json`);
const recommendationRules = readJson(`${GEN}/12-recommendation-rules.json`);
const mealLogic = readJson(`${GEN}/08-meal-logic.json`);
const accommodationLogic = readJson(`${GEN}/09-accommodation-logic.json`);
const routeLegIndex = readJson(`${GEN}/04-route-leg-index.json`);
const pickupContexts = readJson(`${GEN}/01-pickup-contexts.json`);
const dropoffContexts = readJson(`${GEN}/02-dropoff-contexts.json`);

const wikiManifest = readJson(`${WIKI}/_manifest.json`);
const wikiGapReport = readJson(`${WIKI}/gap-report.json`);
const wikiItineraries = readJson(`${WIKI}/package-itineraries.json`);
const webSchema = readText(`${WEB}/schema.prisma`);
const boBundle = readJson(`${BO}/exports/itinerary-core-bundle.json`);

const extractorBy = (id) => arr(extractionManifest?.extractors).find((e) => e.extractor === id) ?? null;

// destination-intelligence fields jvto-web is known to model (lesson: read the
// schema, do not trust an inventory summary). Detected dynamically below.
const WEB_INTEL_FIELDS = [
  'physical_demand', 'difficulty_level', 'altitude', 'weather_by_season',
  'rainfall_intensity', 'trail_details', 'required_gear', 'permit_required',
  'permit_details', 'guide_required', 'risk_factors'
];
// where each web field would be promoted (informational target, not done here).
const WEB_PROMOTION_TARGET = {
  physical_demand: '06-destination-activity-profiles',
  difficulty_level: '06-destination-activity-profiles',
  altitude: '06-destination-activity-profiles',
  trail_details: '06-destination-activity-profiles',
  required_gear: '07-operational-events',
  guide_required: '07-operational-events',
  permit_required: '07-operational-events',
  permit_details: '07-operational-events',
  risk_factors: '12-recommendation-rules',
  weather_by_season: '12-recommendation-rules',
  rainfall_intensity: '12-recommendation-rules'
};

const groups = {};
const opportunities = [];

// ── 1. packages ────────────────────────────────────────────────────────────
{
  const wikiClean = wikiManifest?.clean === true;
  const wikiCount = wikiManifest?.canonical_package_count ?? null;
  const catalogCount = arr(packageCatalog).length;
  const gapTotal = wikiGapReport?.summary?.total ?? null;
  const artifacts = arr(wikiManifest?.artifacts);
  const need = ['package-registry.json', 'package-pricing.json', 'package-itineraries.json', 'booking-compatibility.json'];
  const haveAll = need.every((a) => artifacts.includes(a));
  const llm = extractorBy('llm_wiki');
  const covered = wikiClean && haveAll && catalogCount > 0 && gapTotal === 0;
  groups.packages = group(covered ? STATUS.COVERED : STATUS.PARTIAL, {
    counts: { wiki_canonical: wikiCount, catalog_index: catalogCount, gap_total: gapTotal },
    evidence: [
      `llm-wiki package-readiness clean=${wikiClean}`,
      `${catalogCount} packages in package-catalog-index`,
      `gap-report total ${gapTotal}`,
      llm ? `extractor llm_wiki connected=${llm.connected}` : 'llm_wiki extractor entry missing'
    ],
    covered_items: haveAll ? ['registry', 'pricing', 'itineraries', 'booking_compatibility'] : artifacts,
    do_not_duplicate: [
      'do not recreate package registry manually',
      'do not rewrite package pricing or itineraries manually'
    ],
    next_actions: covered ? ['consume existing package-readiness artifacts only'] : ['reconcile missing package-readiness artifacts']
  });
}

// ── 2. package_operational_days ──────────────────────────────────────────────
{
  const days = arr(wikiItineraries).reduce((acc, p) => acc + arr(p.days).length, 0);
  const pkgs = arr(wikiItineraries).length;
  const boDays = arr(boBundle?.package_itinerary_days).length;
  const eventCount = arr(operationalEvents).length;
  // Source days exist; only a sparse subset is promoted into operational events.
  groups.package_operational_days = group(STATUS.PARTIAL, {
    counts: { source_days_llm_wiki: days, source_packages: pkgs, backoffice_itinerary_days: boDays, operational_events_promoted: eventCount },
    evidence: [
      `${days} operational days across ${pkgs} packages in llm-wiki package-itineraries.json`,
      `${boDays} backoffice package_itinerary_days rows in export bundle`,
      `${eventCount} promoted entries in 07-operational-events.json`
    ],
    covered_items: [`${days} day-plans available in source (day/title/meals/hotel)`],
    source_exists_not_promoted: [
      `per-day meal/hotel/sequence detail exists in source but only ${eventCount} operational events are promoted`
    ],
    missing_items: ['day-level operational-event mapping for the majority of the 57 source days'],
    do_not_duplicate: ['do not re-key itinerary day plans manually — derive from package-itineraries.json + backoffice day_details'],
    next_actions: ['promote day-level meal/hotel/sequence into 07-operational-events from existing source days']
  });
}

// ── 3. source_snapshot_freshness ─────────────────────────────────────────────
{
  const localVer = wikiManifest?.schema_version ?? null;
  const localGen = wikiManifest?.generated_at ?? null;
  const artifacts = arr(wikiManifest?.artifacts);
  const hasOpsDaysArtifact = artifacts.includes('package-operational-days.json');
  // Cannot fetch upstream repos in this run (scoped to itinerary-core); record
  // local snapshot identity and flag upstream comparison as the next action.
  groups.source_snapshot_freshness = group(STATUS.PARTIAL, {
    counts: { llm_wiki_artifacts: artifacts.length },
    confidence: 'medium',
    evidence: [
      `local llm-wiki snapshot ${localVer} generated_at ${localGen}`,
      `local snapshot artifacts: ${artifacts.join(', ')}`,
      'upstream repo outputs not fetched in this run (scope limited to jvto-itinerary-core)'
    ],
    covered_items: [`llm-wiki snapshot present (${localVer})`],
    stale_items: hasOpsDaysArtifact ? [] : ['no dedicated package-operational-days.json artifact in local snapshot (days are embedded in package-itineraries.json)'],
    missing_items: ['upstream-vs-local version comparison not performed (no related-repo access this run)'],
    next_actions: [
      'fetch upstream llm-wiki output/products/package-readiness/_manifest.json and compare schema_version before promoting operational-day logic'
    ]
  });
}

// ── 4. backoffice_reference_data ─────────────────────────────────────────────
{
  const bo = extractorBy('new_backoffice');
  const connected = bo?.connected === true;
  const rc = bo?.record_counts ?? {};
  const groupsPresent = ['hotels', 'vehicles', 'crew_roles', 'activities'].filter((k) => (rc[k] ?? 0) > 0 || arr(boBundle?.[k]).length > 0);
  const manualSeed = generatedManifest?.source_mode === 'manual_seed_mvp';
  // connected + reference groups present, but freshness unproven while the
  // generated manifest still self-reports manual_seed_mvp.
  groups.backoffice_reference_data = group(connected ? STATUS.PARTIAL : STATUS.BLOCKED, {
    counts: rc,
    confidence: 'medium',
    evidence: [
      `extraction-manifest new_backoffice.connected=${connected}`,
      `bundle reference groups: ${['hotels', 'room_types', 'vehicle_types', 'crew_roles', 'transport_crew_rules', 'destination_activities', 'other_activities'].filter((k) => arr(boBundle?.[k]).length > 0).join(', ')}`,
      manualSeed ? 'generated manifest still reports source_mode=manual_seed_mvp (production freshness unproven)' : 'generated manifest source_mode reconciled'
    ],
    covered_items: groupsPresent,
    partial_items: manualSeed ? ['production freshness unproven — manifest still manual_seed_mvp'] : [],
    missing_items: ['proof that snapshot reference rows match current production backoffice'],
    do_not_duplicate: ['do not re-enter hotels/vehicles/crew/activities manually — they exist in the backoffice export bundle'],
    next_actions: ['re-run backoffice extractor against live export and reconcile manifest source_mode']
  });
}

// ── 5. backoffice_booking_patterns ───────────────────────────────────────────
{
  const logistics = arr(boBundle?.booking_logistics_patterns).length;
  const finance = arr(boBundle?.booking_finance_patterns).length;
  const actualCost = arr(boBundle?.actual_cost_patterns).length;
  const present = logistics > 0 || finance > 0 || actualCost > 0;
  groups.backoffice_booking_patterns = group(present ? STATUS.PARTIAL : STATUS.NOT_STARTED, {
    counts: { booking_logistics_patterns: logistics, booking_finance_patterns: finance, actual_cost_patterns: actualCost },
    confidence: 'low',
    evidence: [
      `bundle booking_logistics_patterns=${logistics}, booking_finance_patterns=${finance}, actual_cost_patterns=${actualCost}`,
      'patterns are aggregated and PII-free; not per-customer rows'
    ],
    covered_items: present ? ['aggregated booking logistics / finance / actual-cost patterns present'] : [],
    partial_items: ['low sample counts; route coverage incomplete'],
    missing_items: ['booking-pattern coverage across all route legs (sparse vs route-leg-index)'],
    do_not_duplicate: ['do not reconstruct booking patterns manually — consume aggregated backoffice patterns'],
    next_actions: ['widen backoffice booking-pattern sampling to cover Tumpak Sewu / Madakaripura / Papuma routes']
  });
}

// ── 6. jvto_web_destination_intelligence ─────────────────────────────────────
{
  const web = extractorBy('jvto_web');
  const connected = web?.connected === true;
  const fieldsInSchema = WEB_INTEL_FIELDS.filter((f) => webSchema && new RegExp(`\\b${f}\\b`).test(webSchema));
  // promoted iff the field name appears in the evaluator-facing datasets 06/07/12
  const haystack = [destProfiles, operationalEvents, recommendationRules].map((d) => JSON.stringify(d ?? '')).join(' ');
  const promoted = fieldsInSchema.filter((f) => new RegExp(`\\b${f}\\b`).test(haystack));
  const notPromoted = fieldsInSchema.filter((f) => !promoted.includes(f));
  const status = connected && notPromoted.length > 0 ? STATUS.PARTIAL : connected ? STATUS.COVERED : STATUS.BLOCKED;
  groups.jvto_web_destination_intelligence = group(status, {
    counts: { intel_fields_in_schema: fieldsInSchema.length, promoted: promoted.length, not_promoted: notPromoted.length },
    confidence: 'high',
    evidence: [
      `extraction-manifest jvto_web.connected=${connected}`,
      `destination-intelligence fields present in input/jvto-web/schema.prisma: ${fieldsInSchema.join(', ')}`,
      `fields found in generated datasets 06/07/12: ${promoted.length ? promoted.join(', ') : 'none'}`
    ],
    covered_items: promoted,
    source_exists_not_promoted: notPromoted.map((f) => `${f} → ${WEB_PROMOTION_TARGET[f] ?? '06/07/12'} (in schema, not in generated datasets)`),
    missing_items: notPromoted.length ? [`${notPromoted.length} jvto-web intelligence fields not yet promoted into evaluator datasets`] : [],
    do_not_duplicate: ['do not hand-author destination risk/gear/weather data — promote it from the jvto-web schema source'],
    next_actions: ['design an extractor pass that promotes jvto-web destination-intelligence fields into 06/07/12']
  });
  if (notPromoted.length) {
    opportunities.push({
      id: 'promote-jvto-web-destination-intelligence',
      priority: 'high',
      why: `${notPromoted.length} destination-intelligence fields exist in jvto-web schema but are absent from generated datasets 06/07/12`,
      source: 'input/jvto-web/schema.prisma + generated datasets 06/07/12 comparison',
      target: ['06-destination-activity-profiles.json', '07-operational-events.json', '12-recommendation-rules.json'],
      fields: notPromoted,
      blocked_by: []
    });
  }
}

// ── 7. route_nodes ───────────────────────────────────────────────────────────
{
  const pending = arr(routeNodeReview).filter((n) => (n.review_status ?? n.status) !== 'resolved');
  groups.route_nodes = group(pending.length ? STATUS.PARTIAL : STATUS.COVERED, {
    counts: { pending: pending.length, total: arr(routeNodeReview).length },
    evidence: [`${pending.length} route-node candidates pending review`].concat(
      pending.slice(0, 6).map((n) => `${n.candidate_id ?? n.id}: ${n.review_status ?? n.status} (evidence ${n.evidence_strength ?? '?'}, action ${n.recommended_action ?? '?'})`)
    ),
    partial_items: pending.map((n) => n.candidate_id ?? n.id),
    missing_items: pending.filter((n) => (n.evidence_strength ?? '') === 'low').map((n) => `${n.candidate_id ?? n.id}: insufficient source evidence to promote`),
    do_not_duplicate: ['do not auto-promote route nodes without explicit source evidence'],
    next_actions: ['resolve pending candidates only where source evidence justifies promote/hold/reject']
  });
  if (pending.length) {
    opportunities.push({
      id: 'resolve-route-node-candidates',
      priority: 'medium',
      why: `${pending.length} route-node candidates pending review`,
      source: 'route-node-candidate-review.json',
      target: ['route-node-candidate-review', 'route-leg generation'],
      blocked_by: ['needs explicit source evidence per node before promotion']
    });
  }
}

// ── 8. route_legs ────────────────────────────────────────────────────────────
{
  const legs = arr(routeLegIndex);
  const nullDistance = legs.filter((l) => l.distance_km == null).map((l) => l.id);
  const gaps = arr(routeGapReport).filter((g) => arr(g.missing_fields).includes('explicit_movement_source'));
  const covered = gaps.length === 0 && nullDistance.length === 0;
  groups.route_legs = group(covered ? STATUS.COVERED : STATUS.PARTIAL, {
    counts: { legs: legs.length, null_distance: nullDistance.length, explicit_movement_source_gaps: gaps.length },
    evidence: [
      `${legs.length} legs in route-leg-index`,
      `${gaps.length} explicit_movement_source gap(s) in route-source-gap-report`,
      `${nullDistance.length} legs with null distance_km`
    ],
    covered_items: [`${legs.length - nullDistance.length} legs with distance + duration`],
    partial_items: nullDistance,
    missing_items: gaps.map((g) => `${g.token_or_node ?? g.id}: explicit_movement_source missing`),
    do_not_duplicate: ['do not mark route direction/distance fully covered while an explicit movement source is missing'],
    next_actions: gaps.map((g) => `source explicit TravelAction fromLocation/toLocation for ${g.token_or_node ?? g.id}`)
  });
  if (gaps.length) {
    opportunities.push({
      id: 'close-route-source-gaps',
      priority: 'medium',
      why: `${gaps.length} leg(s) split from slug tokens lack an explicit movement source`,
      source: 'route-source-gap-report.json',
      target: ['route-leg-index.json'],
      blocked_by: ['needs explicit movement source from llm-wiki package-registry or backoffice']
    });
  }
}

// ── 9. pickup_dropoff_contexts ───────────────────────────────────────────────
{
  const pu = arr(pickupContexts);
  const dr = arr(dropoffContexts);
  // verified real field names (lesson 3): pickup=default_ready_buffer_minutes, dropoff=default_buffer_minutes
  const puMissing = pu.filter((c) => c.default_ready_buffer_minutes == null).map((c) => c.id);
  const drMissing = dr.filter((c) => c.default_buffer_minutes == null).map((c) => c.id);
  const allBuffered = puMissing.length === 0 && drMissing.length === 0 && pu.length > 0 && dr.length > 0;
  const basis = [...new Set([...pu, ...dr].flatMap((c) => arr(c.source_trace).map((t) => t.confidence ?? t.source)))];
  groups.pickup_dropoff_contexts = group(allBuffered ? STATUS.COVERED : STATUS.PARTIAL, {
    counts: { pickup: pu.length, dropoff: dr.length, pickup_missing_buffer: puMissing.length, dropoff_missing_buffer: drMissing.length },
    confidence: 'medium',
    evidence: [
      `${pu.length} pickup contexts (field default_ready_buffer_minutes), ${dr.length} dropoff contexts (field default_buffer_minutes)`,
      `all buffers populated=${allBuffered}`,
      `source basis: ${basis.join(', ')}`
    ],
    covered_items: [`${pu.length + dr.length} contexts with buffers populated`],
    partial_items: [...puMissing, ...drMissing],
    do_not_duplicate: ['do not re-enter pickup/dropoff buffers manually — they are generated with backoffice_observed calibration'],
    next_actions: ['confirm custom-address and previous-dropoff buffer assumptions with ops (currently manual_seed)']
  });
}

// ── 10. operational_contexts ─────────────────────────────────────────────────
{
  const rows = arr(opContextResolution);
  const tally = rows.reduce((a, r) => { const k = r.resolution_status ?? r.status; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  const unresolved = rows.filter((r) => (r.resolution_status ?? r.status) !== 'resolved');
  const missing = [...new Set(unresolved.flatMap((r) => arr(r.remaining_missing_fields).concat(arr(r.missing_fields))))]
    .filter((f) => f && f !== 'phase5_context_resolution');
  groups.operational_contexts = group(unresolved.length ? STATUS.PARTIAL : STATUS.COVERED, {
    counts: tally,
    evidence: [
      'operational-context-resolution-report present',
      `resolution tally: ${JSON.stringify(tally)}`
    ],
    covered_items: rows.filter((r) => (r.resolution_status ?? r.status) === 'resolved').map((r) => r.label ?? r.id),
    partial_items: rows.filter((r) => (r.resolution_status ?? r.status) === 'partially_resolved').map((r) => r.label ?? r.id),
    missing_items: missing,
    next_actions: ['fill buffer_minutes / ferry_or_transfer_timing / operational_rule_source from booking logistics or explicit ops rules']
  });
}

// ── 11. meal_logic ───────────────────────────────────────────────────────────
{
  const m = arr(mealLogic);
  groups.meal_logic = group(m.length >= 5 ? STATUS.COVERED : STATUS.PARTIAL, {
    counts: { entries: m.length },
    evidence: [`${m.length} meal-logic entries`, 'entries carry backoffice_observed rate ranges where matched'],
    covered_items: m.map((x) => x.id ?? x.label),
    missing_items: ['lunch/dinner scenarios for waterfall days and multi-day packages'],
    next_actions: ['add meal logic for Tumpak Sewu / Madakaripura days and multi-day lunch patterns from package-itineraries days']
  });
}

// ── 12. accommodation_logic ──────────────────────────────────────────────────
{
  const a = arr(accommodationLogic);
  const noBo = a.filter((x) => !x.backoffice_observed).map((x) => x.id ?? x.area_id);
  groups.accommodation_logic = group(a.length && noBo.length === 0 ? STATUS.COVERED : STATUS.PARTIAL, {
    counts: { entries: a.length, without_backoffice_observed: noBo.length },
    evidence: [`${a.length} accommodation-logic entries`, `${noBo.length} without backoffice_observed confirmation`],
    covered_items: a.map((x) => x.id ?? x.area_id),
    partial_items: noBo,
    missing_items: noBo.length ? ['backoffice confirmation for llm-wiki-only staging areas (e.g. Tumpak Sewu / Papuma)'] : [],
    next_actions: ['confirm staging-area hotel rates from backoffice where currently llm-wiki-only']
  });
}

// ── 13. cost_components ──────────────────────────────────────────────────────
{
  const c = arr(costComponents);
  const withRate = c.filter((x) => x.default_rate_idr != null);
  const classify = (x) => {
    if (x.status === 'needs_review') return 'needs_review';
    if (x.status === 'draft' || /approval/i.test(x.formula ?? '')) return 'future_or_approval_only';
    if (x.backoffice_observed) return 'null_but_backoffice_observed';
    if (/by_route|by_channel|allowance|selected activity|cash_allocation|transfer|ferry_or_handoff/i.test(x.formula ?? '')) return 'variable_by_route_or_channel';
    return 'manual_seed_needs_rate';
  };
  const nullClasses = {};
  c.filter((x) => x.default_rate_idr == null).forEach((x) => {
    const k = classify(x);
    (nullClasses[k] ??= []).push(x.id);
  });
  groups.cost_components = group(STATUS.PARTIAL, {
    counts: { total: c.length, with_default_rate: withRate.length, null_rate: c.length - withRate.length },
    evidence: [
      `${c.length} cost components (IDs joinable to evaluator); ${withRate.length} carry a default_rate_idr`,
      'evaluator emits component IDs only — no totals, no final pricing',
      `null-rate classification: ${JSON.stringify(Object.fromEntries(Object.entries(nullClasses).map(([k, v]) => [k, v.length])))}`
    ],
    covered_items: withRate.map((x) => x.id),
    partial_items: nullClasses.null_but_backoffice_observed ?? [],
    missing_items: nullClasses.manual_seed_needs_rate ?? [],
    null_rate_classification: nullClasses,
    needs_human_decision: (nullClasses.future_or_approval_only ?? []).concat(nullClasses.needs_review ?? []),
    do_not_duplicate: [
      'evaluator must not output final pricing',
      'do not build a cost engine that computes totals in this layer'
    ],
    next_actions: ['promote quantity/rate/channel rules to a dedicated cost engine only when manual_seed_needs_rate items have sourced rates']
  });
  if ((nullClasses.manual_seed_needs_rate ?? []).length) {
    opportunities.push({
      id: 'source-missing-cost-component-rates',
      priority: 'medium',
      why: `${nullClasses.manual_seed_needs_rate.length} cost components have null rate with no backoffice/formula basis`,
      source: '10-cost-components.json',
      target: ['10-cost-components.json'],
      fields: nullClasses.manual_seed_needs_rate,
      blocked_by: ['needs sourced rate (backoffice actuals or vendor quote)']
    });
  }
}

// ── 14. scenario_evaluator_readiness ─────────────────────────────────────────
{
  const evaluator = exists('src/scenario/evaluateScenario.ts');
  const adrEngine = exists('docs/adr/0001-scenario-evaluator-engine.md');
  const adrChecklist = exists('docs/adr/0001-scenario-evaluator-pr-checklist.md');
  const testFile = exists('src/scenario/evaluateScenario.test.ts');
  const ok = evaluator && adrEngine && adrChecklist && testFile;
  groups.scenario_evaluator_readiness = group(ok ? STATUS.COVERED : STATUS.PARTIAL, {
    evidence: [
      `evaluateScenario.ts present=${evaluator}`,
      `ADR engine=${adrEngine}, ADR checklist=${adrChecklist}`,
      `scenario test present=${testFile}`,
      'intelligence:check readiness command lives in PR #11 (not yet on main)'
    ],
    covered_items: ['evaluator', 'ADR-0001 engine', 'ADR-0001 PR checklist', 'scenario gate tests'].filter((_, i) => [evaluator, adrEngine, adrChecklist, testFile][i]),
    do_not_duplicate: ['do not refactor evaluator', 'do not add pricing to evaluator'],
    next_actions: ['after PR #11 merges, run npm run intelligence:check before any evaluator change']
  });
}

// ── 15. source_status_consistency ────────────────────────────────────────────
{
  const exMode = extractionManifest?.source_mode ?? null;
  const genMode = generatedManifest?.source_mode ?? null;
  const mismatch = exMode === 'source_connected' && genMode === 'manual_seed_mvp';
  groups.source_status_consistency = group(mismatch ? STATUS.PARTIAL : STATUS.COVERED, {
    counts: { extraction_source_mode: exMode, generated_source_mode: genMode },
    confidence: 'high',
    evidence: [
      `extraction-manifest.source_mode=${exMode}`,
      `generated manifest.source_mode=${genMode}`,
      mismatch
        ? 'status reporting inconsistent: extraction is source_connected but generated manifest still reports manual_seed_mvp'
        : 'extraction and generated source_mode are consistent'
    ],
    missing_items: mismatch ? ['generated manifest source_mode not reconciled with connected extraction'] : [],
    do_not_duplicate: ['do not silently trust stale manifest wording — it misleads future agents'],
    next_actions: mismatch ? ['reconcile generated manifest.source_mode to reflect Phase-2 source-connected extraction'] : []
  });
  if (mismatch) {
    opportunities.push({
      id: 'reconcile-manifest-source-mode',
      priority: 'high',
      why: 'extraction is source_connected but generated manifest still reports manual_seed_mvp',
      source: 'extraction-manifest.json vs manifest.json',
      target: ['generated/itinerary-intelligence/manifest.json'],
      blocked_by: []
    });
  }
}

// ── assemble + summary ───────────────────────────────────────────────────────
const summary = { covered: 0, partial: 0, blocked: 0, not_started: 0 };
for (const g of Object.values(groups)) summary[g.status] += 1;
const ok = summary.partial === 0 && summary.blocked === 0 && summary.not_started === 0;

const report = {
  schema_version: SCHEMA_VERSION,
  generated_at: new Date().toISOString(),
  ok,
  summary,
  groups,
  implementation_opportunities: opportunities.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
  })
};

const outPath = `${GEN}/data-readiness-report.json`;
writeFileSync(abs(outPath), JSON.stringify(report, null, 2) + '\n', 'utf8');

// ── stdout summary ─────────────────────────────────────────────────────────
const tag = (s) => s.toUpperCase().padEnd(12);
const oneLiner = (g) => (g.missing_items?.[0] ?? g.source_exists_not_promoted?.[0] ?? g.partial_items?.[0] ?? '');
console.log(`itinerary intelligence — data readiness — ${report.generated_at.slice(0, 10)}`);
console.log(`covered: ${summary.covered}  partial: ${summary.partial}  blocked: ${summary.blocked}  not_started: ${summary.not_started}  (ok=${ok})\n`);
for (const [name, g] of Object.entries(groups)) {
  console.log(`${name.padEnd(36)} ${tag(g.status)} ${oneLiner(g)}`.trimEnd());
}
if (opportunities.length) {
  console.log(`\nimplementation_opportunities (${opportunities.length}):`);
  for (const o of report.implementation_opportunities) console.log(`  [${o.priority}] ${o.id} — ${o.why}`);
}
console.log(`\nreport: ${outPath}`);
