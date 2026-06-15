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

export async function validateItineraryIntelligence(dir: string = GENERATED_DIR): Promise<ValidationReport> {
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
