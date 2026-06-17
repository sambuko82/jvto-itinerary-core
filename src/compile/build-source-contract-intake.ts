import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { INPUT_DIR } from '../config/paths.js';
import { inventoryGeneratedAt } from '../config/inventory-meta.js';
import { buildPackageCatalogIndex } from './build-package-catalog-index.js';

/**
 * Phase 6A — Source Contract Intake.
 *
 * Consumes the Phase 6A-0 source-contract snapshots (committed in input/), validates
 * them, reconciles their divergent package_id namespaces to the canonical catalog key
 * via the existing package-catalog-index, joins on `canonical_catalog_key + day`, and
 * emits a readiness report + a package/day intelligence skeleton.
 *
 * No inference beyond what the sources state: no route_node_id, no exact time, no cost,
 * no hotel-area, no pickup/dropoff feasibility, no fatigue, no recommendation. Null is
 * preserved where unknown. Deterministic (generated_at from the snapshot manifest).
 */

const READINESS_SCHEMA_VERSION = 'itinerary-core-source-contract-readiness/v1';

const LLM_WIKI_OP_PATH = 'input/llm-wiki/package-readiness/package-operational-days.json';
const JVTO_WEB_ACT_PATH = 'input/jvto-web/publicContent/generated/packageActivitySnapshots.json';
const BACKOFFICE_COST_PATH = 'input/new-backoffice/exports/itinerary-core/cost-reference-rates.json';

const LLM_WIKI_BASIS = 'llm-wiki.package-operational-days';
const JVTO_WEB_BASIS = 'jvto-web.packageActivitySnapshots';

// ── source schemas (lenient on enums so unexpected-but-present values warn, not fail) ──
const operationalDaySchema = z.object({
  package_id: z.string(),
  slug: z.string(),
  day: z.number(),
  title: z.string(),
  meal_codes: z.array(z.string()),
  hotel_label: z.string().nullable(),
  overnight_status: z.string(),
  source_basis: z.string(),
  missing_fields: z.array(z.string()),
  notes: z.string()
});
const operationalDaysSchema = z.array(operationalDaySchema);

const activitySchema = z.object({
  activity_order: z.number(),
  activity_type: z.string(),
  activity_name: z.string(),
  time_window: z.string().nullable(),
  duration_minutes: z.number().nullable(),
  from_label: z.string().nullable(),
  to_label: z.string().nullable(),
  destination_label: z.string().nullable(),
  source_basis: z.string()
});
const activitySnapshotItemSchema = z.object({
  package_id: z.string(),
  slug: z.string(),
  day: z.number(),
  day_title: z.string(),
  activities: z.array(activitySchema)
});
const activitySnapshotFileSchema = z.object({
  schema_version: z.string(),
  generated_at: z.string(),
  source: z.string(),
  items: z.array(activitySnapshotItemSchema)
});

const costReferenceSchema = z.record(z.unknown());

type OperationalDay = z.infer<typeof operationalDaySchema>;
type ActivitySnapshotItem = z.infer<typeof activitySnapshotItemSchema>;
type Activity = z.infer<typeof activitySchema>;

// ── output shapes ──
type RequiredStatus = 'available' | 'missing' | 'required_failed';
type OptionalStatus = 'available' | 'missing_optional_source' | 'schema_failed';

interface RequiredSourceStatus {
  status: RequiredStatus;
  path: string;
  schema_valid: boolean;
  errors: string[];
}
interface LlmWikiSourceStatus extends RequiredSourceStatus {
  record_count: number;
}
interface JvtoWebSourceStatus extends RequiredSourceStatus {
  package_count: number;
  day_count: number;
  activity_count: number;
}
interface BackofficeSourceStatus {
  status: OptionalStatus;
  path: string;
  section_counts: Record<string, number>;
  schema_valid: boolean;
  errors: string[];
}

export interface SourceContractReadinessReport {
  schema_version: string;
  generated_at: string;
  sources: {
    llm_wiki_package_operational_days: LlmWikiSourceStatus;
    jvto_web_package_activity_snapshots: JvtoWebSourceStatus;
    new_backoffice_cost_reference_rates: BackofficeSourceStatus;
  };
  joinability: {
    join_key: 'canonical_catalog_key+day';
    llm_wiki_days: number;
    jvto_web_days: number;
    matched_days: number;
    raw_join_count: number;
    resolved_join_count: number;
    unresolved_llm_wiki_package_ids: string[];
    unresolved_jvto_web_package_ids: string[];
    missing_in_llm_wiki: string[];
    missing_in_jvto_web: string[];
    title_mismatch_warnings: Array<{ catalog_package_key: string; day: number; llm_wiki_title: string; jvto_web_day_title: string }>;
  };
  quality_report: {
    critical_count: number;
    warning_count: number;
    warnings: string[];
  };
}

export type DayEndDisposition = 'overnight_hotel' | 'continue_onward' | 'trip_end' | 'unknown';
export type CheckoutMode = 'none' | 'checkout_then_continue' | 'checkout_at_end';

/**
 * Operational day-flow derived purely from the source activity sequence + overnight_status
 * (no invented durations/distances). Answers: does the guest return to a hotel at day end,
 * how does the day terminate, and is there a same-day checkout before continuing onward
 * (e.g. Ijen -> Bali: checkout, then Ijen, then straight to Bali — no hotel return).
 */
export interface DayFlow {
  returns_to_hotel: boolean;
  day_end_disposition: DayEndDisposition;
  checkout_mode: CheckoutMode;
  derived_from: string;
}

export type ScheduleRole = 'arrival' | 'departure' | 'intermediate';

/**
 * Arrival/departure time-sensitivity of a day, derived from day position + disposition
 * (source-backed, no invented times). Flags WHICH days are sensitive to flight/transport
 * timing — e.g. a late Surabaya arrival compresses the day-1 transfer, and the final
 * return-to-gateway day needs a safe departure buffer. Computing the actual sequence
 * order / buffer minutes additionally requires per-leg travel durations, which are a
 * known route_legs gap (flagged in the data-readiness report, not invented here).
 */
export interface DaySchedule {
  role: ScheduleRole;
  time_sensitive: boolean;
  needs_leg_duration: boolean;
  basis: string;
}

export interface PackageDaySkeletonRecord {
  catalog_package_key: string;
  llm_wiki_package_id: string | null;
  jvto_web_package_id: string | null;
  slug: string;
  day: number;
  day_title: string | null;
  meal_codes: string[];
  hotel_label: string | null;
  overnight_status: string;
  activities: Activity[];
  day_flow: DayFlow;
  schedule: DaySchedule;
  source_basis: string[];
  missing_sources: string[];
  notes: string[];
}

export interface SourceContractIntake {
  readiness: SourceContractReadinessReport;
  skeleton: PackageDaySkeletonRecord[];
}

type RawRead =
  | { state: 'missing' }
  | { state: 'parse_error'; error: string }
  | { state: 'ok'; value: unknown };

/**
 * Read + parse a snapshot without throwing. A present-but-malformed snapshot is
 * reported as `parse_error` so the readiness report can mark the source as
 * required_failed / schema_failed instead of crashing the intake before any
 * report is written.
 */
function readRaw(path: string): RawRead {
  const abs = resolve(path);
  if (!existsSync(abs)) return { state: 'missing' };
  let text: string;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (err) {
    return { state: 'parse_error', error: `read failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  try {
    return { state: 'ok', value: JSON.parse(text) as unknown };
  } catch (err) {
    return { state: 'parse_error', error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function zodErrors(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).slice(0, 25);
}

const dayKey = (catalogKey: string, day: number): string => `${catalogKey}|${day}`;

// Gateway endpoints (origin cities / airports) — used only to tell a final return-home
// transfer apart from a cross-region continue-onward. Matched against source labels only.
const GATEWAY_END = /\b(surabaya|juanda|airport|malang)\b/i;

/** Derive operational day-flow from the ordered activity sequence + overnight_status. */
function deriveDayFlow(activities: Activity[], overnightStatus: string): DayFlow {
  const last = activities[activities.length - 1];
  const endsCheckIn = last?.activity_type === 'CheckInAction';
  const endsOnward = last?.activity_type === 'TravelAction' && !!last.to_label;

  let day_end_disposition: DayEndDisposition;
  if (overnightStatus === 'hotel') {
    // Guest sleeps at a hotel tonight (incl. days ending in a transfer to that hotel).
    day_end_disposition = 'overnight_hotel';
  } else if (overnightStatus === 'no_overnight' || overnightStatus === 'overnight_in_vehicle') {
    day_end_disposition = endsOnward && GATEWAY_END.test(last!.to_label ?? '') ? 'trip_end' : 'continue_onward';
  } else if (endsCheckIn) {
    day_end_disposition = 'overnight_hotel';
  } else if (endsOnward) {
    day_end_disposition = GATEWAY_END.test(last!.to_label ?? '') ? 'trip_end' : 'continue_onward';
  } else {
    day_end_disposition = 'unknown';
  }

  const returns_to_hotel = day_end_disposition === 'overnight_hotel';

  // Same-day checkout that is followed by further visits/onward travel means the guest
  // carries luggage and does not return to that hotel (e.g. checkout -> Ijen -> Bali).
  let checkout_mode: CheckoutMode = 'none';
  const coIdx = activities.findIndex((x) => x.activity_type === 'CheckOutAction');
  if (coIdx > -1) {
    const continuesAfter = activities
      .slice(coIdx + 1)
      .some((x) => x.activity_type === 'TouristAttractionVisit' || x.activity_type === 'TravelAction');
    checkout_mode = continuesAfter ? 'checkout_then_continue' : 'checkout_at_end';
  }

  return { returns_to_hotel, day_end_disposition, checkout_mode, derived_from: 'activity_sequence+overnight_status' };
}

/** Arrival/departure time-sensitivity from day position + flow (no invented times). */
function deriveSchedule(activities: Activity[], flow: DayFlow, day: number, minDay: number, maxDay: number): DaySchedule {
  const hasTransfer = activities.some((x) => x.activity_type === 'TravelAction' && !!x.to_label);
  let role: ScheduleRole = 'intermediate';
  let time_sensitive = false;
  if (day === minDay) {
    // arrival day: a late gateway arrival compresses any same-day transfer / overnight reach
    role = 'arrival';
    time_sensitive = hasTransfer;
  } else if (day === maxDay) {
    // final day: returning to the gateway to catch onward transport needs a safe buffer
    role = 'departure';
    time_sensitive = flow.day_end_disposition === 'trip_end';
  }
  // ordering the rest-first sequence / sizing the departure buffer additionally needs
  // per-leg travel durations (a known route_legs gap) — flagged, never invented here.
  return { role, time_sensitive, needs_leg_duration: time_sensitive, basis: 'day_position+day_flow' };
}

export async function buildSourceContractIntake(): Promise<SourceContractIntake> {
  const generated_at = inventoryGeneratedAt();
  const catalog = await buildPackageCatalogIndex();

  // canonical reconciliation maps from the existing catalog (no manual/hardcoded pairs)
  const catalogByPackageId = new Map(catalog.map((c) => [c.package_id, c]));
  const catalogByPublicUrl = new Map(catalog.map((c) => [c.public_url, c]));

  const warnings: string[] = [];

  // ── 1. llm-wiki operational days (required) ──
  const opRead = readRaw(LLM_WIKI_OP_PATH);
  let opDays: OperationalDay[] = [];
  const llmStatus: LlmWikiSourceStatus = {
    status: 'available',
    path: LLM_WIKI_OP_PATH,
    record_count: 0,
    schema_valid: false,
    errors: []
  };
  if (opRead.state === 'missing') {
    llmStatus.status = 'missing';
    llmStatus.errors.push('snapshot file not found');
  } else if (opRead.state === 'parse_error') {
    llmStatus.status = 'required_failed';
    llmStatus.errors.push(opRead.error);
  } else {
    const parsed = operationalDaysSchema.safeParse(opRead.value);
    if (parsed.success) {
      opDays = parsed.data;
      llmStatus.schema_valid = true;
      llmStatus.record_count = opDays.length;
    } else {
      llmStatus.status = 'required_failed';
      llmStatus.errors = zodErrors(parsed.error);
    }
  }

  // ── 2. jvto-web activity snapshots (required) ──
  const actRead = readRaw(JVTO_WEB_ACT_PATH);
  let actItems: ActivitySnapshotItem[] = [];
  const jvtoStatus: JvtoWebSourceStatus = {
    status: 'available',
    path: JVTO_WEB_ACT_PATH,
    package_count: 0,
    day_count: 0,
    activity_count: 0,
    schema_valid: false,
    errors: []
  };
  if (actRead.state === 'missing') {
    jvtoStatus.status = 'missing';
    jvtoStatus.errors.push('snapshot file not found');
  } else if (actRead.state === 'parse_error') {
    jvtoStatus.status = 'required_failed';
    jvtoStatus.errors.push(actRead.error);
  } else {
    const parsed = activitySnapshotFileSchema.safeParse(actRead.value);
    if (parsed.success) {
      actItems = parsed.data.items;
      jvtoStatus.schema_valid = true;
      jvtoStatus.package_count = new Set(actItems.map((i) => i.package_id)).size;
      jvtoStatus.day_count = actItems.length;
      jvtoStatus.activity_count = actItems.reduce((n, i) => n + i.activities.length, 0);
    } else {
      jvtoStatus.status = 'required_failed';
      jvtoStatus.errors = zodErrors(parsed.error);
    }
  }

  // ── 3. new-backoffice cost reference (optional) ──
  const costRead = readRaw(BACKOFFICE_COST_PATH);
  const boStatus: BackofficeSourceStatus = {
    status: 'missing_optional_source',
    path: BACKOFFICE_COST_PATH,
    section_counts: {},
    schema_valid: false,
    errors: []
  };
  if (costRead.state === 'missing') {
    warnings.push(
      'new-backoffice cost-reference-rates.json not available; run php artisan export:cost-reference-rates in an environment with live DB .env'
    );
  } else if (costRead.state === 'parse_error') {
    boStatus.status = 'schema_failed';
    boStatus.errors.push(costRead.error);
  } else {
    const parsed = costReferenceSchema.safeParse(costRead.value);
    if (parsed.success) {
      boStatus.status = 'available';
      boStatus.schema_valid = true;
      for (const [section, value] of Object.entries(parsed.data)) {
        boStatus.section_counts[section] = Array.isArray(value) ? value.length : 1;
      }
    } else {
      boStatus.status = 'schema_failed';
      boStatus.errors = zodErrors(parsed.error);
    }
  }

  // ── reconcile each source row to the canonical catalog key ──
  interface ResolvedOp { catalogKey: string; slug: string; day: number; op: OperationalDay }
  interface ResolvedAct { catalogKey: string; slug: string; day: number; item: ActivitySnapshotItem }

  const resolvedOps: ResolvedOp[] = [];
  const unresolvedLlmWiki = new Set<string>();
  for (const op of opDays) {
    const cat = catalogByPackageId.get(op.package_id);
    if (!cat) {
      unresolvedLlmWiki.add(op.package_id);
      continue;
    }
    resolvedOps.push({ catalogKey: cat.catalog_key, slug: cat.slug, day: op.day, op });
  }

  const resolvedActs: ResolvedAct[] = [];
  const unresolvedJvtoWeb = new Set<string>();
  for (const item of actItems) {
    const cat = catalogByPublicUrl.get(`/${item.slug}`);
    if (!cat) {
      unresolvedJvtoWeb.add(item.package_id);
      continue;
    }
    resolvedActs.push({ catalogKey: cat.catalog_key, slug: cat.slug, day: item.day, item });
  }

  // index by canonical catalog key + day (never by array index)
  const opByDay = new Map<string, ResolvedOp>();
  for (const r of resolvedOps) opByDay.set(dayKey(r.catalogKey, r.day), r);
  const actByDay = new Map<string, ResolvedAct>();
  for (const r of resolvedActs) actByDay.set(dayKey(r.catalogKey, r.day), r);

  // raw (namespace-blind) join: what a naive package_id+day join would have matched
  const rawOpKeys = new Set(opDays.map((o) => `${o.package_id}|${o.day}`));
  const rawJoinCount = actItems.filter((a) => rawOpKeys.has(`${a.package_id}|${a.day}`)).length;

  // resolved join + missing-side accounting
  const allDayKeys = new Set<string>([...opByDay.keys(), ...actByDay.keys()]);
  let resolvedJoinCount = 0;
  const missingInLlmWiki: string[] = []; // present in jvto-web, absent in llm-wiki
  const missingInJvtoWeb: string[] = []; // present in llm-wiki, absent in jvto-web
  const titleMismatches: SourceContractReadinessReport['joinability']['title_mismatch_warnings'] = [];

  for (const key of allDayKeys) {
    const o = opByDay.get(key);
    const a = actByDay.get(key);
    if (o && a) {
      resolvedJoinCount += 1;
      if (o.op.title !== a.item.day_title) {
        titleMismatches.push({
          catalog_package_key: o.catalogKey,
          day: o.day,
          llm_wiki_title: o.op.title,
          jvto_web_day_title: a.item.day_title
        });
      }
    } else if (a && !o) {
      missingInLlmWiki.push(key);
    } else if (o && !a) {
      missingInJvtoWeb.push(key);
    }
  }

  // ── build the package/day skeleton over the union of resolved day keys ──
  const skeleton: PackageDaySkeletonRecord[] = [];
  // per-package day range, so each day knows whether it is the arrival/departure day
  const dayRange = new Map<string, { min: number; max: number }>();
  for (const key of allDayKeys) {
    const rec = (opByDay.get(key) ?? actByDay.get(key))!;
    const cur = dayRange.get(rec.catalogKey);
    if (!cur) dayRange.set(rec.catalogKey, { min: rec.day, max: rec.day });
    else {
      cur.min = Math.min(cur.min, rec.day);
      cur.max = Math.max(cur.max, rec.day);
    }
  }
  for (const key of allDayKeys) {
    const o = opByDay.get(key);
    const a = actByDay.get(key);
    const catalogKey = (o ?? a)!.catalogKey;
    const slug = (o ?? a)!.slug;
    const day = (o ?? a)!.day;

    const source_basis: string[] = [];
    const missing_sources: string[] = [];
    const notes: string[] = [];

    if (o) source_basis.push(LLM_WIKI_BASIS);
    else missing_sources.push(LLM_WIKI_BASIS);
    if (a) source_basis.push(JVTO_WEB_BASIS);
    else missing_sources.push(JVTO_WEB_BASIS);

    if (o && o.op.notes.trim()) notes.push(o.op.notes.trim());

    const activities = a ? [...a.item.activities].sort((x, y) => x.activity_order - y.activity_order) : [];
    const overnight_status = o ? o.op.overnight_status : 'unknown';
    const day_flow = deriveDayFlow(activities, overnight_status);
    const range = dayRange.get(catalogKey)!;
    const schedule = deriveSchedule(activities, day_flow, day, range.min, range.max);

    skeleton.push({
      catalog_package_key: catalogKey,
      llm_wiki_package_id: o ? o.op.package_id : null,
      jvto_web_package_id: a ? a.item.package_id : null,
      slug,
      day,
      day_title: a ? a.item.day_title : o ? o.op.title : null,
      meal_codes: o ? o.op.meal_codes : [],
      hotel_label: o ? o.op.hotel_label : null,
      overnight_status,
      activities,
      day_flow,
      schedule,
      source_basis,
      missing_sources,
      notes
    });
  }

  // stable sort: catalog_package_key, then day
  skeleton.sort((x, y) => (x.catalog_package_key === y.catalog_package_key ? x.day - y.day : x.catalog_package_key < y.catalog_package_key ? -1 : 1));

  // ── assemble warnings + quality report ──
  const unresolvedLlmWikiList = [...unresolvedLlmWiki].sort();
  const unresolvedJvtoWebList = [...unresolvedJvtoWeb].sort();
  missingInLlmWiki.sort();
  missingInJvtoWeb.sort();
  titleMismatches.sort((x, y) => (x.catalog_package_key === y.catalog_package_key ? x.day - y.day : x.catalog_package_key < y.catalog_package_key ? -1 : 1));

  if (unresolvedLlmWikiList.length) warnings.push(`${unresolvedLlmWikiList.length} llm-wiki package_id(s) did not resolve to a catalog key`);
  if (unresolvedJvtoWebList.length) warnings.push(`${unresolvedJvtoWebList.length} jvto-web package_id(s) did not resolve to a catalog key`);
  if (missingInLlmWiki.length) warnings.push(`${missingInLlmWiki.length} day(s) present in jvto-web but missing in llm-wiki`);
  if (missingInJvtoWeb.length) warnings.push(`${missingInJvtoWeb.length} day(s) present in llm-wiki but missing in jvto-web`);
  if (titleMismatches.length) warnings.push(`${titleMismatches.length} day-title mismatch(es) between sources`);
  warnings.sort();

  // critical = a required source that is missing or failed schema validation
  let critical_count = 0;
  if (llmStatus.status !== 'available' || !llmStatus.schema_valid) critical_count += 1;
  if (jvtoStatus.status !== 'available' || !jvtoStatus.schema_valid) critical_count += 1;

  const readiness: SourceContractReadinessReport = {
    schema_version: READINESS_SCHEMA_VERSION,
    generated_at,
    sources: {
      llm_wiki_package_operational_days: llmStatus,
      jvto_web_package_activity_snapshots: jvtoStatus,
      new_backoffice_cost_reference_rates: boStatus
    },
    joinability: {
      join_key: 'canonical_catalog_key+day',
      llm_wiki_days: opByDay.size,
      jvto_web_days: actByDay.size,
      matched_days: resolvedJoinCount,
      raw_join_count: rawJoinCount,
      resolved_join_count: resolvedJoinCount,
      unresolved_llm_wiki_package_ids: unresolvedLlmWikiList,
      unresolved_jvto_web_package_ids: unresolvedJvtoWebList,
      missing_in_llm_wiki: missingInLlmWiki,
      missing_in_jvto_web: missingInJvtoWeb,
      title_mismatch_warnings: titleMismatches
    },
    quality_report: {
      critical_count,
      warning_count: warnings.length,
      warnings
    }
  };

  return { readiness, skeleton };
}
