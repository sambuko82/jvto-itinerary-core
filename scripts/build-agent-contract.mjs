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
  },
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
w("manifest.json", manifest);
console.log(`agent-contract: ${composition.length} packages | integrity`, manifest.route_integrity_summary);
