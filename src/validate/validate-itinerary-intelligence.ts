import { GENERATED_DIR } from '../config/paths.js';
import { readJson, writeJson } from '../utils/fs.js';
import {
  INVENTORY_SCHEMA_VERSION,
  inventoryGeneratedAt,
  type InventoryRecord
} from '../config/inventory-meta.js';

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface Finding {
  severity: Severity;
  check: string;
  record_id: string | null;
  message: string;
}

export interface ValidationReport {
  schema_version: string;
  generated_at: string;
  source_files: string[];
  summary: { total_records: number; critical: number; high: number; medium: number; low: number };
  status: 'pass' | 'fail';
  critical_errors: Finding[];
  findings: Finding[];
}

// Object KEYS that would indicate raw PII leaked into a record.
const PII_KEYS = new Set([
  'name', 'full_name', 'customer_name', 'guest_name', 'email', 'email_address',
  'phone', 'phone_number', 'mobile', 'whatsapp', 'whatsapp_number', 'passport',
  'passport_number', 'contact_name', 'contact_phone', 'booking_code', 'booking_id',
  'ticket_number', 'password', 'account_number'
]);
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /\+62\d{6,}|\b0\d{9,}\b/;

const CONFIDENCE = new Set(['high', 'medium', 'low']);
const STATUS = new Set(['active', 'incomplete', 'deprecated']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function scanPii(value: unknown, recordId: string, path: string, findings: Finding[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanPii(v, recordId, `${path}[${i}]`, findings));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEYS.has(k.toLowerCase())) {
        findings.push({ severity: 'critical', check: 'pii_key', record_id: recordId, message: `PII key "${k}" at ${path}` });
      }
      scanPii(v, recordId, `${path}.${k}`, findings);
    }
    return;
  }
  if (typeof value === 'string') {
    if (EMAIL_RE.test(value)) {
      findings.push({ severity: 'critical', check: 'pii_value_email', record_id: recordId, message: `email-like value at ${path}` });
    }
    if (PHONE_RE.test(value)) {
      findings.push({ severity: 'critical', check: 'pii_value_phone', record_id: recordId, message: `phone-like value at ${path}` });
    }
  }
}

function checkContract(rec: Record<string, unknown>, file: string, findings: Finding[]): void {
  const id = typeof rec.id === 'string' ? rec.id : null;
  const ref = id ?? `${file}#<no-id>`;
  if (!id) findings.push({ severity: 'critical', check: 'contract_id', record_id: null, message: `record without id in ${file}` });
  if (rec.schema_version !== INVENTORY_SCHEMA_VERSION) {
    findings.push({ severity: 'high', check: 'contract_schema_version', record_id: ref, message: `bad schema_version` });
  }
  const trace = rec.source_trace;
  if (!Array.isArray(trace) || trace.length === 0) {
    findings.push({ severity: 'critical', check: 'source_trace_missing', record_id: ref, message: `source_trace missing/empty` });
  } else {
    for (const t of trace as Array<Record<string, unknown>>) {
      if (!t || typeof t.repo !== 'string' || typeof t.path !== 'string') {
        findings.push({ severity: 'critical', check: 'source_trace_invalid', record_id: ref, message: `source_trace entry missing repo/path` });
      }
    }
  }
  if (!CONFIDENCE.has(String(rec.confidence))) findings.push({ severity: 'medium', check: 'contract_confidence', record_id: ref, message: `invalid confidence` });
  if (!STATUS.has(String(rec.status))) findings.push({ severity: 'medium', check: 'contract_status', record_id: ref, message: `invalid status` });
  if (typeof rec.generated_at !== 'string' || !ISO_RE.test(rec.generated_at)) {
    findings.push({ severity: 'high', check: 'contract_generated_at', record_id: ref, message: `generated_at not ISO-8601` });
  }
  if (!Array.isArray(rec.manual_fields)) findings.push({ severity: 'low', check: 'contract_manual_fields', record_id: ref, message: `manual_fields not array` });
  if (!Array.isArray(rec.missing_fields)) findings.push({ severity: 'low', check: 'contract_missing_fields', record_id: ref, message: `missing_fields not array` });
}

function checkRestrictedExcluded(rec: Record<string, unknown>, findings: Finding[]): void {
  if (rec.pii_class === 'restricted' && rec.excluded_from_extraction !== true) {
    findings.push({
      severity: 'critical',
      check: 'restricted_not_excluded',
      record_id: String(rec.id ?? ''),
      message: `restricted source not marked excluded_from_extraction`
    });
  }
}

export async function validateItineraryIntelligence(
  dir: string = GENERATED_DIR,
  opts: { skipPhase4?: boolean } = {}
): Promise<ValidationReport> {
  const files = ['source-inventory.json', 'schema-inventory.json', 'export-endpoint-inventory.json'];
  const findings: Finding[] = [];
  let total = 0;
  const slugConflicts = new Map<string, Set<string>>();

  for (const file of files) {
    let records: Array<Record<string, unknown>>;
    try {
      records = await readJson<Array<Record<string, unknown>>>(`${dir}/${file}`);
    } catch {
      findings.push({ severity: 'critical', check: 'missing_inventory', record_id: null, message: `inventory file not found: ${file}` });
      continue;
    }
    if (!Array.isArray(records)) {
      findings.push({ severity: 'critical', check: 'inventory_shape', record_id: null, message: `${file} is not an array` });
      continue;
    }
    total += records.length;
    for (const rec of records) {
      checkContract(rec, file, findings);
      checkRestrictedExcluded(rec, findings);
      scanPii(rec, String(rec.id ?? file), '$', findings);
      // package slug consistency (source-inventory carries package_slugs)
      if (Array.isArray(rec.package_slugs)) {
        for (const s of rec.package_slugs as string[]) {
          const owners = slugConflicts.get(s) ?? new Set<string>();
          owners.add(String(rec.repo ?? 'unknown'));
          slugConflicts.set(s, owners);
        }
      }
    }
  }

  // package slug conflict = same slug claimed by >1 repo (none expected; llm-wiki only)
  for (const [slug, owners] of slugConflicts) {
    if (owners.size > 1) {
      findings.push({ severity: 'high', check: 'package_slug_conflict', record_id: null, message: `slug "${slug}" claimed by multiple repos` });
    }
  }

  // ── Phase 3: package catalog + location normalization (validate if present) ──
  const tryRead = async (file: string): Promise<Array<Record<string, unknown>> | null> => {
    try {
      const recs = await readJson<Array<Record<string, unknown>>>(`${dir}/${file}`);
      return Array.isArray(recs) ? recs : null;
    } catch {
      return null;
    }
  };

  const catalog = await tryRead('package-catalog-index.json');
  const aliases = await tryRead('location-alias-registry.json');
  const nodes = await tryRead('route-node-index.json');

  for (const [file, recs] of [
    ['package-catalog-index.json', catalog],
    ['location-alias-registry.json', aliases],
    ['route-node-index.json', nodes]
  ] as const) {
    if (!recs) continue;
    total += recs.length;
    for (const rec of recs) {
      checkContract(rec, file, findings);
      scanPii(rec, String(rec.id ?? file), '$', findings);
    }
  }

  if (nodes) {
    const seen = new Set<string>();
    for (const n of nodes) {
      const id = String(n.node_id);
      if (seen.has(id)) findings.push({ severity: 'critical', check: 'duplicate_node_id', record_id: id, message: `duplicate canonical node id "${id}"` });
      seen.add(id);
      if (n.ambiguous === true) {
        findings.push({ severity: 'low', check: 'ambiguous_location_token', record_id: id, message: `node "${id}" derived from non-standalone slug token; needs source confirmation` });
      }
    }
  }

  if (catalog) {
    const ids = new Set<string>();
    const keys = new Set<string>();
    for (const c of catalog) {
      const pid = String(c.package_id);
      if (ids.has(pid)) findings.push({ severity: 'critical', check: 'package_slug_conflict', record_id: pid, message: `duplicate package_id "${pid}"` });
      ids.add(pid);
      const key = String(c.catalog_key);
      if (keys.has(key)) findings.push({ severity: 'critical', check: 'package_slug_conflict', record_id: pid, message: `duplicate catalog_key "${key}"` });
      keys.add(key);
    }
    // coverage: every extracted package must be mapped into the catalog
    try {
      const extract = await readJson<{ packages: Array<{ package_id: string }> }>(`${dir}/extract-llm-wiki.json`);
      if (extract.packages.length !== catalog.length) {
        findings.push({ severity: 'high', check: 'package_coverage', record_id: null, message: `catalog has ${catalog.length} packages but extract has ${extract.packages.length}` });
      }
    } catch {
      // extract not present in this dir; skip coverage cross-check
    }
  }

  // ── Phase 4: route legs + package route map (validate if present) ──
  // Skipped when validating an earlier phase, so freshly regenerated Phase 3 nodes
  // are not judged against not-yet-regenerated downstream leg/route files.
  const legs = opts.skipPhase4 ? null : await tryRead('route-leg-index.json');
  const routes = opts.skipPhase4 ? null : await tryRead('package-route-map.json');

  for (const [file, recs] of [
    ['route-leg-index.json', legs],
    ['package-route-map.json', routes]
  ] as const) {
    if (!recs) continue;
    total += recs.length;
    for (const rec of recs) {
      checkContract(rec, file, findings);
      scanPii(rec, String(rec.id ?? file), '$', findings);
    }
  }

  if (legs) {
    const knownNodes = new Set((nodes ?? []).map((n) => String(n.node_id)));
    const seenLeg = new Set<string>();
    for (const leg of legs) {
      const id = String(leg.route_leg_id);
      if (seenLeg.has(id)) findings.push({ severity: 'critical', check: 'duplicate_route_leg', record_id: id, message: `duplicate route_leg_id "${id}"` });
      seenLeg.add(id);
      for (const node of [String(leg.from_node), String(leg.to_node)]) {
        if (nodes && !knownNodes.has(node)) {
          findings.push({ severity: 'critical', check: 'route_leg_unknown_node', record_id: id, message: `route leg references unknown node "${node}"` });
        }
      }
      if (Array.isArray(leg.used_by_packages) && (leg.used_by_packages as unknown[]).length === 0) {
        findings.push({ severity: 'low', check: 'orphan_leg', record_id: id, message: `route leg "${id}" used by no package` });
      }
      if (leg.touches_ambiguous_node === true) {
        findings.push({ severity: 'low', check: 'leg_touches_ambiguous_node', record_id: id, message: `route leg "${id}" touches an ambiguous node` });
      }
    }
  }

  if (routes) {
    const legSet = new Set((legs ?? []).map((l) => String(l.route_leg_id)));
    for (const r of routes) {
      const seq = Array.isArray(r.route_sequence) ? (r.route_sequence as unknown[]) : [];
      if (seq.length === 0) findings.push({ severity: 'high', check: 'empty_route_sequence', record_id: String(r.package_id), message: `package "${r.package_id}" has empty route_sequence` });
      for (const lid of (r.route_leg_ids as string[] | undefined) ?? []) {
        if (legs && !legSet.has(lid)) {
          findings.push({ severity: 'high', check: 'orphan_leg', record_id: String(r.package_id), message: `package references leg "${lid}" missing from route-leg-index` });
        }
      }
    }
    if (catalog && routes.length !== catalog.length) {
      findings.push({ severity: 'high', check: 'route_map_coverage', record_id: null, message: `package-route-map has ${routes.length} but catalog has ${catalog.length}` });
    }
  }

  // ── Phase 4.5: source-backed route resolution (validate if present) ──
  const candidates = opts.skipPhase4 ? null : await tryRead('route-source-candidates.json');
  const gaps = opts.skipPhase4 ? null : await tryRead('route-source-gap-report.json');

  for (const [file, recs] of [
    ['route-source-candidates.json', candidates],
    ['route-source-gap-report.json', gaps]
  ] as const) {
    if (!recs) continue;
    total += recs.length;
    for (const rec of recs) {
      checkContract(rec, file, findings);
      scanPii(rec, String(rec.id ?? file), '$', findings);
    }
  }

  if (legs) {
    for (const leg of legs) {
      const id = String(leg.route_leg_id);
      // every route record must carry a source_basis
      if (typeof leg.source_basis !== 'string') {
        findings.push({ severity: 'critical', check: 'missing_source_basis', record_id: id, message: `route leg "${id}" has no source_basis` });
      }
      // distance/duration must never be guessed in this phase
      for (const f of ['distance_km_operator', 'distance_km_mapbox', 'duration_minutes_operator', 'duration_minutes_mapbox']) {
        if (leg[f] !== null && leg[f] !== undefined) {
          findings.push({ severity: 'critical', check: 'guessed_distance_duration', record_id: id, message: `route leg "${id}" has non-null ${f} without a source` });
        }
      }
    }
  }

  if (nodes) {
    for (const n of nodes) {
      const members = Array.isArray(n.member_tokens) ? (n.member_tokens as unknown[]) : [];
      // a compound (merged) node MUST be source-backed — never a blind slug merge
      if (members.length > 1 && (n.source_strength === 'fallback' || n.source_strength === 'unresolved')) {
        findings.push({ severity: 'critical', check: 'unsourced_compound_merge', record_id: String(n.node_id), message: `compound node "${n.node_id}" merged without source backing` });
      }
    }
  }

  // ── Phase 4.6: route-map consistency + operational context handoff ──
  const opcontext = opts.skipPhase4 ? null : await tryRead('operational-context-gap-report.json');
  if (opcontext) {
    total += opcontext.length;
    for (const rec of opcontext) {
      checkContract(rec, 'operational-context-gap-report.json', findings);
      scanPii(rec, String(rec.id ?? 'operational-context-gap-report.json'), '$', findings);
    }
  }

  if (routes) {
    const STALE = 'slug_token_order_from_catalog';
    const VALID_BASIS = new Set(['source_grouped_sequence', 'slug_token_fallback']);
    if (routes.length > 0 && routes.every((r) => r.sequence_basis === STALE)) {
      findings.push({ severity: 'critical', check: 'stale_route_map_metadata', record_id: null, message: 'all package-route-map records still use stale sequence_basis' });
    }
    const handed = new Set((opcontext ?? []).map((o) => String(o.label)));
    for (const r of routes) {
      const pid = String(r.package_id);
      if (!VALID_BASIS.has(String(r.sequence_basis))) {
        findings.push({ severity: 'critical', check: 'stale_route_map_metadata', record_id: pid, message: `invalid/stale sequence_basis "${r.sequence_basis}"` });
      }
      if (!r.route_leg_source_summary || typeof r.route_leg_source_summary !== 'object') {
        findings.push({ severity: 'critical', check: 'missing_leg_source_summary', record_id: pid, message: `route_leg_source_summary missing on "${pid}"` });
      }
      for (const lab of (r.unresolved_movement_labels as string[] | undefined) ?? []) {
        if (!handed.has(lab)) {
          findings.push({ severity: 'critical', check: 'unhanded_movement_label', record_id: pid, message: `unresolved movement label "${lab}" not in operational-context-gap-report` });
        }
      }
    }
  }

  // operational labels must NOT be silently promoted into destination route nodes
  if (opcontext && nodes) {
    const nodeIds = new Set(nodes.map((n) => String(n.node_id)));
    for (const o of opcontext) {
      if (nodeIds.has(String(o.normalized_candidate_id))) {
        findings.push({ severity: 'critical', check: 'operational_promoted_to_node', record_id: String(o.label), message: `operational label "${o.label}" was promoted into a destination node` });
      }
    }
  }

  // ── Phase 5: operational context datasets (validate if present) ──
  if (!opts.skipPhase4) {
    const p5files = [
      'operational-context-index.json',
      'pickup-contexts.json',
      'dropoff-contexts.json',
      'staging-area-contexts.json',
      'time-window-rules.json',
      'route-node-candidate-review.json',
      'operational-context-resolution-report.json'
    ];
    const loaded: Record<string, Array<Record<string, unknown>> | null> = {};
    for (const f of p5files) {
      const recs = await tryRead(f);
      loaded[f] = recs;
      if (!recs) continue;
      total += recs.length;
      for (const rec of recs) {
        checkContract(rec, f, findings);
        scanPii(rec, String(rec.id ?? f), '$', findings);
        // no invented buffer minutes without source
        const json = JSON.stringify(rec);
        if (/"(buffer_minutes|default_ready_buffer_minutes|latest_safe_departure)"\s*:\s*\d/.test(json)) {
          findings.push({ severity: 'critical', check: 'invented_buffer', record_id: String(rec.id ?? ''), message: `invented buffer/time without source in ${f}` });
        }
      }
    }

    // every operational-context-gap label must be accounted for in the resolution report
    if (opcontext && loaded['operational-context-resolution-report.json']) {
      const resolved = new Set(loaded['operational-context-resolution-report.json']!.map((r) => String(r.label)));
      for (const o of opcontext) {
        if (!resolved.has(String(o.label))) {
          findings.push({ severity: 'critical', check: 'operational_label_unaccounted', record_id: String(o.label), message: `handoff label "${o.label}" missing from operational-context-resolution-report` });
        }
      }
    }

    // time-window-rules must not assert exact times without a source
    for (const r of loaded['time-window-rules.json'] ?? []) {
      if (r.exact_time_available === true) {
        findings.push({ severity: 'critical', check: 'exact_time_without_source', record_id: String(r.rule_id ?? ''), message: `time rule claims exact_time_available without source` });
      }
    }

    // operational labels must not be promoted into destination route nodes
    if (nodes) {
      const nodeIds = new Set(nodes.map((n) => String(n.node_id)));
      for (const rec of loaded['operational-context-index.json'] ?? []) {
        if (nodeIds.has(String(rec.normalized_candidate_id))) {
          findings.push({ severity: 'critical', check: 'operational_promoted_to_node', record_id: String(rec.label), message: `operational label "${rec.label}" promoted into a route node` });
        }
      }
    }
  }

  // missing packageDetailSnapshots must produce a gap report, not crash
  if (!opts.skipPhase4) try {
    const jvto = await readJson<{ package_detail_count?: number; missing_fields?: string[] }>(`${dir}/extract-jvto-web.json`);
    const detailMissing = (jvto.missing_fields ?? []).includes('jvto_web_package_detail_snapshots') || (jvto.package_detail_count ?? 0) === 0;
    if (detailMissing && !gaps) {
      findings.push({ severity: 'high', check: 'missing_detail_snapshot_no_gap', record_id: null, message: 'packageDetailSnapshots missing and no route-source-gap-report present' });
    }
  } catch {
    // extract not present; skip
  }

  const summary = {
    total_records: total,
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length
  };

  const report: ValidationReport = {
    schema_version: INVENTORY_SCHEMA_VERSION,
    generated_at: inventoryGeneratedAt(),
    source_files: files,
    summary,
    status: summary.critical === 0 ? 'pass' : 'fail',
    critical_errors: findings.filter((f) => f.severity === 'critical'),
    findings
  };

  await writeJson(`${dir}/validation-report.json`, report);
  return report;
}
