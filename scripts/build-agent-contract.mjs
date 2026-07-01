#!/usr/bin/env node
// Build the agent-safe contract (generated/itinerary-intelligence/agent-contract/*) for
// jvto-whatsapp-agent-runtime. Deterministic, whitelist-only (no cost/rate/vendor/PII).
//
// Route sequence + legs + integrity come from the SOURCE-BACKED DERIVED map
// (package-route-map.json + route-leg-index.filled.json), which covers Papuma & Taman
// Safari and uses forward node__to__node legs. Standard endpoints / documented
// customizations are hybrid-sourced from the legacy 11-package-route-map.json (the derived
// map has no dropoff field). Overlays/staging/pickup-dropoff/route-validation are projected
// from the operational datasets (06/09/01/02/03).
//
// Integrity (Option A — route-order-clean):
//   gap          : route_map_status != "confirmed" or empty route_sequence
//   needs_review : route_source_strength != "confirmed" OR contains_ambiguous_node
//                  OR a sold destination is missing from the route_sequence
//   clean        : otherwise
// unresolved_movement_count (hotel/transit labels -> Phase 5 contexts) is surfaced as
// operational_movements_pending (informational, NON-gating).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEN = join(ROOT, "generated", "itinerary-intelligence");
const OUT = join(GEN, "agent-contract");
const CONTRACT_VERSION = "agent-contract-v1";

const rj = (p) => JSON.parse(readFileSync(join(GEN, p), "utf8"));
const w = (name, val) => {
  writeFileSync(join(OUT, name), JSON.stringify(val, null, 2) + "\n", "utf8");
  return JSON.stringify(val).length;
};

const catalog = rj("package-catalog-index.json");
const derived = Object.fromEntries(rj("package-route-map.json").map((e) => [e.package_id, e]));
const legByIdFilled = Object.fromEntries(rj("route-leg-index.filled.json").map((l) => [l.route_leg_id, l]));
const legacy = rj("11-package-route-map.json");
const pickups = rj("01-pickup-contexts.json");
const dropoffs = rj("02-dropoff-contexts.json");
const twr = rj("03-time-window-rules.json");
const destProfiles = rj("06-destination-activity-profiles.json");
const staging = rj("09-accommodation-logic.json");

// ---- helpers --------------------------------------------------------------
const NODE_LABEL = {
  bali: "Bali", surabaya: "Surabaya", bromo: "Bromo", ijen: "Ijen",
  madakaripura: "Madakaripura", papuma: "Papuma", tumpak_sewu: "Tumpak Sewu",
  malang: "Malang", taman_safari_prigen: "Taman Safari Prigen", bali_ketapang: "Bali / Ketapang",
};
const label = (tok) => NODE_LABEL[tok] ?? tok;
// destination nodes (a leg endpoint here that is NOT in the route_sequence is a real
// discrepancy) vs benign transit hubs (pass-through / return points).
const DEST_NODES = new Set(["bromo", "ijen", "madakaripura", "papuma", "tumpak_sewu", "taman_safari_prigen"]);

function canonDests(tokens) {
  const ts = new Set(tokens);
  const out = [];
  for (const k of ["bromo", "ijen", "madakaripura", "papuma", "malang"]) if (ts.has(k)) out.push(k);
  if (ts.has("tumpak") && ts.has("sewu")) out.push("tumpak_sewu");
  if (ts.has("taman") && ts.has("safari")) out.push("taman_safari_prigen");
  return out;
}
function destRefs(tokens) {
  const ts = new Set(tokens);
  const out = [];
  if (ts.has("bromo")) out.push("destination_bromo_activity_profile");
  if (ts.has("ijen")) out.push("destination_ijen_activity_profile");
  if (ts.has("madakaripura")) out.push("destination_madakaripura_activity_profile");
  if (ts.has("papuma")) out.push("destination_papuma_activity_profile");
  if (ts.has("tumpak") && ts.has("sewu")) out.push("destination_tumpak_sewu_activity_profile");
  if (ts.has("malang")) out.push("destination_malang_batu_activity_profile");
  return out;
}
function stagingRefs(tokens, origin) {
  const ts = new Set(tokens);
  const out = [];
  if (ts.has("bromo")) out.push("bromo_area_sunrise_staging");
  if (ts.has("ijen")) out.push(origin.toLowerCase() === "bali" ? "banyuwangi_staging" : "bondowoso_ijen_staging");
  if (ts.has("tumpak") && ts.has("sewu")) out.push("tumpak_sewu_staging");
  if (ts.has("papuma")) out.push("papuma_staging");
  if (ts.has("malang")) out.push("malang_batu_staging");
  return out;
}
// match canonical catalog package to its legacy 11- entry by (origin, slug) for endpoints
function legacyFor(cat) {
  const slug = cat.slug, origin = cat.origin.toLowerCase();
  for (const e of legacy) {
    const eslug = e.package_id.endsWith("-bali") ? e.package_id.slice(0, -5) : e.package_id;
    if (e.origin.toLowerCase() === origin && eslug === slug) return e;
  }
  return null;
}

// ---- 1. package-operational-composition.json ------------------------------
const composition = [];
const integrityByKey = {};
const compGaps = [];
for (const cat of catalog) {
  const key = cat.package_id;
  const d = derived[key] ?? {};
  const seqTokens = d.route_sequence ?? [];
  const seq = seqTokens.map(label);
  const legIds = d.route_leg_ids ?? [];

  // per-leg detail + consecutive-pair regression guard
  const legRefs = [];
  const nonForward = []; // reverse/non-adjacent legs between two sequenced nodes
  const offSeq = [];     // a DESTINATION endpoint missing from route_sequence (leg/sequence disagree)
  for (const lid of legIds) {
    const leg = legByIdFilled[lid];
    const from = leg ? leg.from_node : null;
    const to = leg ? leg.to_node : null;
    let alignment = "transit"; // one endpoint is a transit hub not in the sequence (benign)
    if (from != null && to != null) {
      const i = seqTokens.indexOf(from), j = seqTokens.indexOf(to);
      const missingDest = (i === -1 && DEST_NODES.has(from)) || (j === -1 && DEST_NODES.has(to));
      if (missingDest) { alignment = "off_sequence"; offSeq.push(lid); }      // leg references an unsequenced destination
      else if (to === seqTokens[0]) alignment = "return_to_origin";          // final leg back to start (origin may also be sequenced)
      else if (i === -1 || j === -1) alignment = "transit";                  // benign pass-through hub
      else if (j === i + 1) alignment = "forward_adjacent";
      else if (i === j + 1) { alignment = "reverse_adjacent"; nonForward.push(lid); }
      else { alignment = "non_adjacent"; nonForward.push(lid); }
    }
    legRefs.push({ leg_ref: lid, from: from ? label(from) : null, to: to ? label(to) : null, alignment });
  }

  const dests = canonDests(cat.destination_tokens);
  const seqSet = new Set(seqTokens);
  const missing = dests.filter((dk) => !seqSet.has(dk));

  const mapStatus = d.route_map_status;
  const strength = d.route_source_strength;
  const ambiguous = !!d.contains_ambiguous_node;
  let integrity;
  if (mapStatus !== "confirmed" || seq.length === 0) integrity = "gap";
  else if (strength !== "confirmed" || ambiguous || missing.length || nonForward.length || offSeq.length) integrity = "needs_review";
  else integrity = "clean";
  integrityByKey[key] = integrity;
  const confidence = integrity === "clean" ? "high" : integrity;

  const flags = {};
  if (missing.length) flags.destinations_missing_from_route = missing;
  if (nonForward.length) flags.non_forward_legs = nonForward;
  if (offSeq.length) flags.off_sequence_legs = offSeq;
  if (ambiguous) flags.contains_ambiguous_node = true;
  if (strength && strength !== "confirmed") flags.route_source_strength = strength;

  if (integrity !== "clean") compGaps.push({ package_key: key, integrity, flags });

  composition.push({
    package_key: key,
    catalog_key: cat.catalog_key,
    origin: cat.origin,
    duration: cat.duration,
    route_sequence: seq,
    route_leg_refs: legRefs,
    destination_refs: destRefs(cat.destination_tokens),
    staging_refs: stagingRefs(cat.destination_tokens, cat.origin),
    allowed_standard_endpoints: (legacyFor(cat)?.standard_dropoff_options) ?? [],
    ijen_relevant: cat.ijen_relevant,
    visits_madakaripura: cat.visits_madakaripura,
    is_specialty: cat.is_specialty,
    route_integrity: integrity,
    route_review_flags: flags,
    operational_movements_pending: d.unresolved_movement_count ?? 0,
    composition_confidence: confidence,
    route_source_strength: strength ?? null,
    source_refs: [
      "package-route-map.json (derived, source-backed)",
      "route-leg-index.filled.json",
      "11-package-route-map.json (legacy: endpoints only)",
      "package-catalog-index.json",
    ],
  });
}

// ---- 2. route-validation-rules.json ---------------------------------------
const MSG = {
  late_arrival_before_ijen: "late_arrival_reduces_ijen_rest",
  late_surabaya_arrival_before_bromo: "late_arrival_possible_but_tiring",
  airport_dropoff_cutoff_after_waterfall: "tight_connection_requires_validation",
};
const rvRules = twr.map((r) => {
  const cond = r.condition || {};
  let req = [];
  if (cond.dropoff_type === "airport") req = ["flight_number", "departure_time"];
  else if ("arrival_after" in cond || "hotel_arrival_after" in cond) req = ["arrival_time"];
  return {
    rule_id: r.id, trigger: cond, required_customer_fields: req,
    minimum_buffer_minutes: cond.minimum_flight_buffer_minutes ?? null,
    customer_safe_message_key: MSG[r.id] ?? r.id,
    requires_feasibility: r.severity === "high", severity: r.severity, impact: r.impact,
    source_refs: ["03-time-window-rules.json"],
  };
});
rvRules.push({
  rule_id: "connection_buffer_rule", trigger: { dropoff_type: ["airport", "train_station", "harbor"] },
  required_customer_fields: ["departure_time"], minimum_buffer_minutes: null,
  customer_safe_message_key: "ask_exact_departure_time", requires_feasibility: true,
  severity: "medium", impact: ["missed_connection_risk"], source_refs: ["02-dropoff-contexts.json"],
});

// ---- 3. pickup-dropoff-requirements.json ----------------------------------
function fzWhen(role, ctx) {
  const when = new Set();
  const affects = ctx.affects || [];
  if (affects.includes("first_day_route_feasibility")) when.add("arrival_time_late");
  if (ctx.type === "airport") (role === "pickup" ? ["same_day_bromo_sunrise", "same_day_ijen_transfer"] : ["tight_flight_connection"]).forEach((x) => when.add(x));
  if (ctx.type === "harbor") when.add("ferry_timing_dependency");
  return [...when].sort();
}
const pd = {
  pickups: pickups.map((p) => ({
    location_ref: p.id, label: p.label, type: p.type, location_group: p.location_group,
    required_fields: p.required_customer_fields, risk_factors: p.risk_factors || [],
    default_ready_buffer_minutes: p.default_ready_buffer_minutes ?? null,
    requires_feasibility_when: fzWhen("pickup", p), confidence: p.confidence,
    source_refs: ["01-pickup-contexts.json"],
  })),
  dropoffs: dropoffs.map((d) => ({
    location_ref: d.id, label: d.label, type: d.type, location_group: d.location_group,
    connects_to: d.connects_to || [], required_fields: d.required_customer_fields,
    risk_factors: d.risk_factors || [], default_buffer_minutes: d.default_buffer_minutes ?? null,
    requires_feasibility_when: fzWhen("dropoff", d), confidence: d.confidence,
    source_refs: ["02-dropoff-contexts.json"],
  })),
};

// ---- 4. destination-operational-overlays.json -----------------------------
const BEST_STAGING = {
  "Bondowoso / Ijen Area": "bondowoso_ijen_staging",
  "Banyuwangi / Ijen Area": "banyuwangi_staging",
  "Bromo Area": "bromo_area_sunrise_staging",
};
const LIVE = new Set(["health_screening", "monthly_closure", "weather", "national_park_access",
  "waterfall_access_condition", "coastal_access_condition", "ferry_crossing", "authority_access"]);
const overlays = destProfiles.map((dp) => ({
  destination: dp.destination_id, profile_ref: dp.id,
  operational_overlay: {
    requires_previous_overnight: BEST_STAGING[dp.best_previous_overnight] ?? null,
    best_previous_overnight: dp.best_previous_overnight ?? null,
    bad_previous_overnight: dp.bad_previous_overnight || [],
    required_prior_events: dp.required_prior_events || [],
    fatigue_score: dp.fatigue_score ?? null,
    activity_window: dp.activity_window || {},
    requires_live_check: (dp.dependencies || []).filter((x) => LIVE.has(x)).sort(),
    warning_rules: dp.warning_rules || [],
    difficulty_level: dp.destination_intelligence?.difficulty_level ?? null,
    physical_demand: dp.destination_intelligence?.physical_demand ?? null,
  },
  source_refs: ["06-destination-activity-profiles.json"],
}));

// ---- 5. staging-logic.json ------------------------------------------------
const stagingOut = staging.map((s) => ({
  staging_id: s.id, label: s.label, purpose: s.purpose,
  recommended_for: s.recommended_for || [], operational_notes: s.operational_notes || [],
  risk_if_arrival_late: s.risk_if_arrival_late || [], confidence: s.confidence,
  source_refs: ["09-accommodation-logic.json"],
}));

// ---- 6. package-customization-boundaries.json -----------------------------
const HANDOFF_TRIGGERS = ["own_hotel", "non_standard_rooming", "special_or_oversized_luggage",
  "custom_route_outside_standard", "non_standard_add_on", "date_specific_availability_request",
  "group_discount_exception"];
const boundaries = catalog.map((cat) => {
  const key = cat.package_id;
  const integrity = integrityByKey[key] ?? "gap";
  const lg = legacyFor(cat);
  const endpoints = lg?.standard_dropoff_options ?? [];
  // Block instant-book if unroutable OR if there is no standard-endpoint boundary data
  // (the runtime can't distinguish a standard drop-off from a custom route without it).
  const noEndpoints = endpoints.length === 0;
  const blocks = integrity === "gap" || noEndpoints;
  const gatedReason = integrity === "gap" ? "composition_gap_unroutable" : (noEndpoints ? "no_standard_endpoints" : null);
  return {
    package_key: key,
    instant_book_eligible: cat.instant_book,
    whatsapp_assisted_eligible: cat.whatsapp_assisted,
    route_integrity: integrity,
    composition_blocks_instant_book: blocks,
    effective_instant_book_eligible: Boolean(cat.instant_book) && !blocks,
    instant_book_gated_reason: gatedReason,
    standard_endpoints: endpoints,
    documented_customizations: lg?.possible_customizations ?? [],
    handoff_or_quote_triggers: HANDOFF_TRIGGERS,
    boundary_note: "Honor effective_instant_book_eligible, not the raw catalog instant_book_eligible: a composition gap (unroutable) forces WhatsApp-assisted handoff. route_integrity=needs_review means route order is confirmed but a source/coverage signal needs validation; explain with care and prefer feasibility validation.",
    source_refs: ["package-route-map.json (derived)", "11-package-route-map.json", "package-catalog-index.json",
      "agent-contract/package-operational-composition.json"],
  };
});

// ---- 7. operational-readiness.json ----------------------------------------
const cleanCount = Object.values(integrityByKey).filter((v) => v === "clean").length;
const opReadiness = {
  schema_version: CONTRACT_VERSION,
  source_mode: "source_connected",
  legacy_dataset_mode: "derived_source_backed",
  global_guardrails: [
    "Static knowledge is never live truth: availability, closure, booking, payment, and hotel/vehicle/guide confirmation require a live tool.",
    "Route order + legs are projected from the source-backed derived map; operator distances are seeds, re-verify at booking.",
    "This agent-contract carries NO cost, vendor rate, margin, crew identity, or PII.",
  ],
  datasets: [
    { dataset: "package_operational_composition", status: "covered", customer_usage: "structure_and_routing",
      requires_human_review_when: ["route_integrity != clean", "custom_route"],
      note: `${cleanCount}/${catalog.length} packages have clean route integrity (confirmed order, all sold destinations routed, no ambiguous node). Source: derived package-route-map.json. Unresolved operational movements (hotel/transit labels) are surfaced per package as operational_movements_pending and handled by live tools, not the route gate.`,
      gaps: compGaps },
    { dataset: "route_validation_rules", status: "partial", customer_usage: "guardrail_only", requires_feasibility: true,
      requires_human_review_when: ["custom_route", "tight_connection", "special_pickup"] },
    { dataset: "pickup_dropoff_requirements", status: "covered", customer_usage: "clarification_questions",
      requires_human_review_when: ["custom_address", "previous_tour_dropoff"], note: "Several buffers are manual_seed; confirm with ops." },
    { dataset: "destination_operational_overlays", status: "covered", customer_usage: "readiness_and_warnings",
      requires_live_confirmation_for: ["ijen.health_screening", "ijen.monthly_closure", "blue_fire", "weather", "national_park_access"] },
    { dataset: "staging_logic", status: "partial", customer_usage: "explanation",
      requires_human_review_when: ["tumpak_sewu_staging (llm-wiki only)", "papuma_staging (llm-wiki only)", "malang_batu_staging (llm-wiki only)"] },
    { dataset: "package_customization_boundaries", status: "covered", customer_usage: "handoff_decision" },
  ],
  source_refs: ["package-route-map.json", "route-leg-index.filled.json", "data-readiness-report.json"],
};

// ---- 7.5 standard-route-truth.json ----------------------------------------
// Per-package consolidated STANDARD ROUTE TRUTH with an explicit classification on
// every field, so the runtime can answer topic questions with a class — not a bare
// string it might present as settled fact. Taxonomy (exactly one per field):
//   final_jvto_standard  : fixed operating policy, independent of date/conditions
//   source_backed_estimate: directionally reliable but not guaranteed (seed/mapbox)
//   live_condition       : only valid at request time; never asserted statically
//   exception            : package-specific deviation from a shared JVTO rule
//   absent               : no source rule + no shared JVTO rule of same scope (gap)
const CLASS = {
  STANDARD: "final_jvto_standard",
  ESTIMATE: "source_backed_estimate",
  LIVE: "live_condition",
  EXCEPTION: "exception",
  ABSENT: "absent",
};
const LIVE_DEP = new Set(["health_screening", "monthly_closure", "weather", "national_park_access",
  "waterfall_access_condition", "coastal_access_condition", "ferry_crossing", "authority_access", "blue_fire"]);
const ESTIMATE_ONLY_STAGING = new Set(["tumpak_sewu_staging", "papuma_staging", "malang_batu_staging"]);
const destProfileById = Object.fromEntries(destProfiles.map((d) => [d.id, d]));
const stagingById = Object.fromEntries(staging.map((s) => [s.id, s]));

function pickupEntry(p) {
  return { location_ref: p.id, label: p.label, type: p.type, location_group: p.location_group,
    required_fields: p.required_customer_fields || [], classification: CLASS.STANDARD, evidence: ["01-pickup-contexts.json"] };
}
// Valid pickups are origin-scoped (a shared JVTO rule): Surabaya-origin tours use the
// Surabaya pickup contexts; Bali-origin tours are picked up at the guest's Bali hotel.
// custom_address is universal. There is no structured bali_hotel_pickup context yet.
function validPickups(cat) {
  const gaps = [];
  const universal = pickups.filter((p) => p.location_group === "Custom").map(pickupEntry);
  if (cat.origin.toLowerCase() === "surabaya") {
    const grp = pickups.filter((p) => p.location_group === "Surabaya").map(pickupEntry);
    return { options: [...grp, ...universal], gaps };
  }
  const originEntry = {
    location_ref: null, label: "Bali hotel area pickup (origin)", type: "hotel", location_group: "Bali",
    required_fields: ["hotel_area", "pickup_time"], classification: CLASS.STANDARD,
    evidence: ["package-route-map.json (route_sequence[0])", "package-catalog-index.json (origin=Bali)"],
    note: "Origin-scoped standard: Bali-origin tours are picked up at the guest's Bali hotel. No structured 01-pickup-context exists for this yet.",
  };
  gaps.push({ field: "pickup_context", classification: CLASS.ABSENT,
    reason: "no bali_hotel_pickup context in 01-pickup-contexts.json for Bali-origin packages (pickup rule is origin-derived, not a structured context)" });
  return { options: [originEntry, ...universal], gaps };
}
function dropoffCtxFor(opt) {
  const o = opt.toLowerCase();
  for (const d of dropoffs) {
    const ty = (d.type || "").toLowerCase(), grp = (d.location_group || "").toLowerCase();
    if (o.includes("airport") && ty === "airport") return d;
    if (o.includes("hotel") && ty === "hotel" && !o.includes("bali")) return d;
    if ((o.includes("ketapang") || o.includes("harbor")) && ty === "harbor") return d;
    if ((o.includes("gilimanuk") || o.includes("bali")) && d.type === "bali_area") return d;
    if (o.includes("malang") && grp === "malang") return d;
  }
  return null;
}
// Valid dropoffs are the package's standard_dropoff_options (per-package endpoint
// whitelist). A "…with additional transfer" / "…with route adjustment" option is a
// live_condition (needs a live arrangement), not a settled standard endpoint.
function validDropoffs(cat) {
  const opts = legacyFor(cat)?.standard_dropoff_options ?? [];
  return opts.map((opt) => {
    const o = opt.toLowerCase();
    const ctx = dropoffCtxFor(opt);
    const isLive = o.includes("additional transfer") || o.includes("route adjustment");
    return { option: opt, location_ref: ctx?.id ?? null, type: ctx?.type ?? null,
      connects_to: ctx?.connects_to ?? [], required_fields: ctx?.required_customer_fields ?? [],
      classification: isLive ? CLASS.LIVE : CLASS.STANDARD,
      evidence: ["11-package-route-map.json (standard_dropoff_options)", ...(ctx ? ["02-dropoff-contexts.json"] : [])] };
  });
}
// Bali-transfer boundary as a STRUCTURED fact (replaces the free-text note that was
// mis-applied to Bali-origin packages which actually finish in Surabaya).
function baliBoundary(cat) {
  const origin = cat.origin.toLowerCase();
  const legs = derived[cat.package_id]?.route_leg_ids ?? [];
  const endpoints = (legacyFor(cat)?.standard_dropoff_options ?? []).map((s) => s.toLowerCase());
  const crossesFromBali = origin === "bali";
  const crossesToBali = origin !== "bali" &&
    endpoints.some((o) => o.includes("bali") || o.includes("gilimanuk") || o.includes("ketapang"));
  let direction = "none";
  if (crossesFromBali && crossesToBali) direction = "both";
  else if (crossesFromBali) direction = "from_bali";
  else if (crossesToBali) direction = "to_bali";
  const crosses = direction !== "none";
  const ferryLeg = legs.find((l) => /ketapang|gilimanuk|bali/.test(l)) ?? null;
  const note = !crosses ? "Route stays within East Java; no Bali sea crossing."
    : direction === "from_bali"
      ? "Bali-origin: Gilimanuk→Ketapang sea crossing at the START; the tour then finishes in Surabaya (NOT a finish in Bali)."
      : direction === "to_bali"
        ? "Finishes toward Bali via a Ketapang/Gilimanuk ferry crossing; the onward Bali hotel transfer is a live arrangement, not a direct hotel drop unless stated."
        : "Crosses the Java–Bali sea boundary at both ends; both ferry legs are live arrangements.";
  return { crosses_boundary: crosses, direction, ferry_leg: ferryLeg,
    boundary_classification: CLASS.STANDARD, onward_transfer_classification: crosses ? CLASS.LIVE : null,
    note, evidence: ["package-route-map.json", "11-package-route-map.json", "02-dropoff-contexts.json"] };
}
function legTruth(cat) {
  const legs = derived[cat.package_id]?.route_leg_ids ?? [];
  return legs.map((lid) => {
    const leg = legByIdFilled[lid] || {};
    const opDur = leg.duration_minutes_operator ?? null, mbDur = leg.duration_minutes_mapbox ?? null;
    const opKm = leg.distance_km_operator ?? null, mbKm = leg.distance_km_mapbox ?? null;
    const timeClass = opDur != null ? CLASS.STANDARD : (mbDur != null ? CLASS.ESTIMATE : CLASS.ABSENT);
    const kmClass = opKm != null ? CLASS.STANDARD : (mbKm != null ? CLASS.ESTIMATE : CLASS.ABSENT);
    return { leg_ref: lid, from: leg.from_node ? label(leg.from_node) : null, to: leg.to_node ? label(leg.to_node) : null,
      duration_minutes: { value: opDur ?? mbDur ?? null, basis: opDur != null ? "operator" : (mbDur != null ? "mapbox" : null),
        classification: timeClass, evidence: ["route-leg-index.filled.json"] },
      distance_km: { value: opKm ?? mbKm ?? null, basis: opKm != null ? "operator" : (mbKm != null ? "mapbox" : null),
        classification: kmClass, evidence: ["route-leg-index.filled.json"] } };
  });
}
function destinationTruth(cat) {
  return destRefs(cat.destination_tokens).map((ref) => {
    const dp = destProfileById[ref] || {};
    return { destination: dp.destination_id ?? ref,
      activity_window: { value: dp.activity_window || {}, classification: CLASS.ESTIMATE, evidence: ["06-destination-activity-profiles.json"] },
      fatigue_score: { value: dp.fatigue_score ?? null, classification: dp.fatigue_score != null ? CLASS.STANDARD : CLASS.ABSENT, evidence: ["06-destination-activity-profiles.json"] },
      live_dependencies: { value: (dp.dependencies || []).filter((x) => LIVE_DEP.has(x)).sort(), classification: CLASS.LIVE, evidence: ["06-destination-activity-profiles.json"] },
      difficulty_level: { value: dp.destination_intelligence?.difficulty_level ?? null, classification: dp.destination_intelligence?.difficulty_level ? CLASS.STANDARD : CLASS.ABSENT, evidence: ["06-destination-activity-profiles.json"] } };
  });
}
// Package-specific deviations from a shared JVTO rule (source-backed, not invented).
function packageExceptions(cat) {
  const out = [];
  if (cat.origin.toLowerCase() === "bali") {
    out.push({ field: "corridor_direction", classification: CLASS.EXCEPTION,
      value: "east_to_west (reverse of the standard Surabaya west→east corridor)",
      evidence: ["package-route-map.json (route_sequence starts at bali)", "src/scenario/evaluateScenario.ts (reverse-direction rule)"],
      note: "Bali-origin tours run the corridor in reverse of the standard Surabaya order; feasibility/staging follow the reversed sequence." });
  }
  if (cat.is_specialty) {
    out.push({ field: "specialty_composition", classification: CLASS.EXCEPTION,
      value: "specialty package (non-standard leg composition)",
      evidence: ["package-catalog-index.json (is_specialty=true)"],
      note: "Specialty package: substitutes a standard volcano-first leg (e.g. Taman Safari) and does not follow the default destination set." });
  }
  return out;
}
function stagingTruth(cat) {
  return stagingRefs(cat.destination_tokens, cat.origin).map((sid) => {
    const s = stagingById[sid] || {};
    return { staging_ref: sid, label: s.label ?? null, purpose: s.purpose ?? null,
      classification: ESTIMATE_ONLY_STAGING.has(sid) ? CLASS.ESTIMATE : CLASS.STANDARD,
      evidence: ["09-accommodation-logic.json"] };
  });
}

const routeTruthGaps = [];
const routeTruth = catalog.map((cat) => {
  const key = cat.package_id;
  const integrity = integrityByKey[key] ?? "gap";
  const pk = validPickups(cat);
  for (const g of pk.gaps) routeTruthGaps.push({ package_key: key, ...g });
  const legs = legTruth(cat);
  const dests = destinationTruth(cat);
  // absent leg time evidence is a real, honest gap (operator durations are frequently null)
  for (const l of legs) {
    if (l.duration_minutes.classification === CLASS.ABSENT)
      routeTruthGaps.push({ package_key: key, field: `leg_duration:${l.leg_ref}`, classification: CLASS.ABSENT, reason: "no operator or mapbox duration for this leg" });
  }
  return {
    package_key: key,
    origin: cat.origin,
    duration: cat.duration,
    route_sequence: {
      value: (derived[key]?.route_sequence ?? []).map(label),
      classification: integrity === "clean" ? CLASS.STANDARD : CLASS.ESTIMATE,
      route_integrity: integrity,
      evidence: ["package-route-map.json (derived, source-backed)"],
    },
    valid_pickups: pk.options,
    valid_dropoffs: validDropoffs(cat),
    bali_transfer: baliBoundary(cat),
    route_legs: legs,
    destinations: dests,
    staging: stagingTruth(cat),
    exceptions: packageExceptions(cat),
    connection_rules: {
      // onward connections exist only at Ketapang harbor; they are live arrangements
      value: validDropoffs(cat).flatMap((d) => d.connects_to),
      classification: CLASS.LIVE,
      evidence: ["02-dropoff-contexts.json (connects_to)"],
    },
    source_refs: [
      "agent-contract/package-operational-composition.json",
      "agent-contract/pickup-dropoff-requirements.json",
      "package-route-map.json (derived)", "route-leg-index.filled.json",
      "06-destination-activity-profiles.json", "09-accommodation-logic.json",
      "11-package-route-map.json (endpoints)",
    ],
  };
});

// classification tally across every classified field (for the manifest + audit)
const classTally = { final_jvto_standard: 0, source_backed_estimate: 0, live_condition: 0, exception: 0, absent: 0 };
function tallyClassifications(node) {
  if (Array.isArray(node)) { node.forEach(tallyClassifications); return; }
  if (node && typeof node === "object") {
    if (typeof node.classification === "string" && node.classification in classTally) classTally[node.classification]++;
    for (const [k, v] of Object.entries(node)) { if (k !== "classification") tallyClassifications(v); }
  }
}
tallyClassifications(routeTruth);

const standardRouteTruth = {
  schema_version: CONTRACT_VERSION,
  purpose: "Per-package standard route truth with an explicit classification on every field. Consumed by knowledge-catalog-jvto-bootstrap's customer-sales projection and the WhatsApp runtime so a fact is never presented above its evidence.",
  classification_taxonomy: {
    final_jvto_standard: "fixed operating policy, independent of date/conditions",
    source_backed_estimate: "directionally reliable but not guaranteed (operator seed / mapbox routing)",
    live_condition: "only valid at request time; never asserted statically (requires a live tool)",
    exception: "package-specific deviation from a shared JVTO rule",
    absent: "no source rule and no shared JVTO rule of same scope (recorded as a gap; surfaced as handoff, never invented)",
  },
  classification_tally: classTally,
  packages: routeTruth,
  gaps: routeTruthGaps,
};

// ---- 7.6 route-truth audit report (human companion, docs/_audit/) ---------
function auditMarkdown() {
  const lines = [];
  lines.push("# Route-Truth Source Audit — 16 Packages", "");
  lines.push("> Generated by `scripts/build-agent-contract.mjs` from the source-backed derived route map + operational datasets. Do not hand-edit; re-run `npm run agent-contract`.", "");
  lines.push("## Classification taxonomy", "");
  for (const [k, v] of Object.entries(standardRouteTruth.classification_taxonomy)) lines.push(`- **${k}** — ${v}`);
  lines.push("", "## Classification tally (all classified fields)", "");
  for (const [k, v] of Object.entries(classTally)) lines.push(`- ${k}: **${v}**`);
  lines.push("", "## Route integrity", "",
    `- clean: **${cleanCount}** / ${catalog.length}`,
    `- needs_review: **${Object.values(integrityByKey).filter((v) => v === "needs_review").length}** (${Object.keys(integrityByKey).filter((k) => integrityByKey[k] === "needs_review").join(", ") || "none"})`,
    `- gap: **${Object.values(integrityByKey).filter((v) => v === "gap").length}**`, "");
  lines.push("## Resolved mismatches", "",
    "- `bali/ijen-papuma-tumpak-sewu-bromo-5d4n`: derived route was already `confirmed`/`clean`, but the legacy `11-package-route-map.json` endpoint table lacked its `-bali` row, force-blocking instant-book with `no_standard_endpoints`. Added the mirrored Bali-origin-corridor row (same endpoints as its 4D3N sibling) — now `effective_instant_book_eligible: true`.",
    "- Bali-transfer boundary is now a structured `bali_transfer` field (direction from_bali/to_bali/both). This corrects the free-text \"finish in Bali\" note that was mis-applied to Bali-origin packages which actually finish in Surabaya.",
    "- Package-key naming: Core keeps two representations — canonical `bali/X` (catalog + agent-contract, aligned with the runtime) and legacy `X-bali` (endpoints only, resolved via `legacyFor()`). Legacy-only Surabaya extras `bromo-ijen-3d2n` / `bromo-ijen-bali-4d3n` are not sold as separate runtime packages.", "");
  lines.push("## Genuine gaps (classified `absent` — surfaced as handoff, never invented)", "");
  if (routeTruthGaps.length === 0) lines.push("- none");
  else for (const g of routeTruthGaps) lines.push(`- \`${g.package_key}\` — ${g.field}: ${g.reason}`);
  lines.push("", "## Per-package field classification", "");
  for (const p of routeTruth) {
    lines.push(`### ${p.package_key}  \`(${p.origin}, ${p.duration})\``);
    lines.push(`- route_sequence → **${p.route_sequence.classification}** (integrity: ${p.route_sequence.route_integrity}) — ${p.route_sequence.value.join(" → ")}`);
    lines.push(`- valid_pickups → ${p.valid_pickups.map((x) => `${x.label} [${x.classification}]`).join("; ")}`);
    lines.push(`- valid_dropoffs → ${p.valid_dropoffs.map((x) => `${x.option} [${x.classification}]`).join("; ") || "—"}`);
    lines.push(`- bali_transfer → crosses=${p.bali_transfer.crosses_boundary} dir=${p.bali_transfer.direction} [${p.bali_transfer.boundary_classification}]`);
    lines.push(`- route_legs (time evidence) → ${p.route_legs.map((l) => `${l.leg_ref}:${l.duration_minutes.value ?? "—"}m/${l.duration_minutes.basis ?? "none"}[${l.duration_minutes.classification}]`).join("; ") || "—"}`);
    lines.push(`- destinations (fatigue/live) → ${p.destinations.map((d) => `${d.destination}:fatigue=${d.fatigue_score.value ?? "—"}[${d.fatigue_score.classification}],live=${d.live_dependencies.value.join("/") || "none"}[live_condition]`).join("; ") || "—"}`);
    lines.push(`- staging → ${p.staging.map((s) => `${s.staging_ref}[${s.classification}]`).join("; ") || "—"}`);
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

// ---- 8. manifest.json -----------------------------------------------------
const manifest = {
  schema_version: CONTRACT_VERSION,
  purpose: "Narrow, agent-safe operational projection for jvto-whatsapp-agent-runtime. Generated by scripts/build-agent-contract.mjs from the source-backed derived route map.",
  generated_from: "generated/itinerary-intelligence/{package-route-map.json,route-leg-index.filled.json,package-catalog-index.json,06,09,01,02,03} + 11-package-route-map.json (endpoints)",
  files: {
    "package-operational-composition.json": composition.length,
    "route-validation-rules.json": rvRules.length,
    "pickup-dropoff-requirements.json": pd.pickups.length + pd.dropoffs.length,
    "destination-operational-overlays.json": overlays.length,
    "staging-logic.json": stagingOut.length,
    "package-customization-boundaries.json": boundaries.length,
    "operational-readiness.json": 1,
    "standard-route-truth.json": routeTruth.length,
  },
  classification_tally: classTally,
  route_integrity_summary: {
    clean: cleanCount,
    needs_review: Object.values(integrityByKey).filter((v) => v === "needs_review").length,
    gap: Object.values(integrityByKey).filter((v) => v === "gap").length,
  },
  guarantees: [
    "no cost components, vendor/supplier rates, margins, or quote totals",
    "no customer PII or raw customer chat",
    "no marketing copy, URLs, media, or booking CTAs",
    "route order + coverage sourced from the confirmed derived map; feasibility is the core evaluator's job",
  ],
  composition_gaps: compGaps,
};

// ---- write ----------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
w("package-operational-composition.json", composition);
w("route-validation-rules.json", rvRules);
w("pickup-dropoff-requirements.json", pd);
w("destination-operational-overlays.json", overlays);
w("staging-logic.json", stagingOut);
w("package-customization-boundaries.json", boundaries);
w("operational-readiness.json", opReadiness);
w("standard-route-truth.json", standardRouteTruth);
w("manifest.json", manifest);

// human companion audit report (outside generated/, deterministic)
const AUDIT_PATH = join(ROOT, "docs", "_audit", "route-truth-audit.md");
mkdirSync(dirname(AUDIT_PATH), { recursive: true });
writeFileSync(AUDIT_PATH, auditMarkdown(), "utf8");

console.log(`agent-contract: ${composition.length} packages | integrity`, manifest.route_integrity_summary);
console.log(`standard-route-truth: ${routeTruth.length} packages | classifications`, classTally, `| gaps ${routeTruthGaps.length}`);
