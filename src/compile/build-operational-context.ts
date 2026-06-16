import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { extractBackoffice } from '../extract/extract-backoffice.js';
import { baseRecord, inventoryGeneratedAt, type InventoryRecord, type InventorySourceTrace } from '../config/inventory-meta.js';

const JVTO_REPO = 'jvto-devteam/jvto-web';
const DETAIL_PATH = 'src/lib/publicContent/generated/packageDetailSnapshots.json';
const BO_REPO = 'jvto-devteam/new-backoffice';
const BUNDLE_PATH = 'app/Http/Controllers/ExportData/ExportDataItineraryCore.php';

type ContextType = 'harbor' | 'airport' | 'hotel_area' | 'city_area' | 'staging_area' | 'route_node_candidate' | 'unknown';
type ResolutionStatus = 'resolved' | 'partially_resolved' | 'pending';
type Dataset =
  | 'pickup-contexts'
  | 'dropoff-contexts'
  | 'staging-area-contexts'
  | 'route-node-candidate-review'
  | 'operational-context-index';

interface GapRecord {
  label: string;
  normalized_candidate_id: string;
  seen_in_packages: string[];
  seen_as: string[];
  likely_context_type: string;
  recommended_phase5_dataset: string;
}

// ── output record shapes ──
export interface OpContextIndexRecord extends InventoryRecord {
  label: string;
  normalized_candidate_id: string;
  context_type: ContextType;
  seen_in_packages: string[];
  seen_as: string[];
  source_recommendation: string;
  resolved_phase5_dataset: string;
  resolution_status: ResolutionStatus;
  notes: string;
}
export interface PickupContextRecord extends InventoryRecord {
  context_id: string;
  label: string;
  normalized_candidate_id: string;
  context_type: ContextType;
  applies_to_packages: string[];
  seen_as: string[];
  rules: string[];
  unresolved_reason: string | null;
}
export interface DropoffContextRecord extends InventoryRecord {
  context_id: string;
  label: string;
  normalized_candidate_id: string;
  context_type: ContextType;
  applies_to_packages: string[];
  seen_as: string[];
  handoff_notes: string[];
}
export interface StagingContextRecord extends InventoryRecord {
  context_id: string;
  label: string;
  normalized_candidate_id: string;
  applies_to_packages: string[];
  seen_as: string[];
  staging_notes: string[];
}
export interface TimeWindowRuleRecord extends InventoryRecord {
  rule_id: string;
  source_context_id: string | null;
  rule_type: 'pickup_time_bucket' | 'airport_handoff_context' | 'harbor_crossing_context' | 'hotel_staging_context' | 'unknown_time_context';
  applies_to_packages: string[];
  source_time_bucket: string | null;
  exact_time_available: boolean;
}
export interface NodeCandidateReviewRecord extends InventoryRecord {
  candidate_id: string;
  label: string;
  normalized_candidate_id: string;
  seen_in_packages: string[];
  seen_as: string[];
  evidence_strength: 'low' | 'medium';
  recommended_action: 'review_for_future_route_node' | 'keep_as_operational_context' | 'needs_source_confirmation';
  reason: string;
  review_status: 'pending_review';
}
export interface ResolutionReportRecord extends InventoryRecord {
  label: string;
  original_recommended_phase5_dataset: string;
  resolved_dataset: string;
  resolution_status: ResolutionStatus;
  reason: string;
  remaining_missing_fields: string[];
}

export interface OperationalContextBundle {
  index: OpContextIndexRecord[];
  pickup: PickupContextRecord[];
  dropoff: DropoffContextRecord[];
  staging: StagingContextRecord[];
  timeRules: TimeWindowRuleRecord[];
  nodeReview: NodeCandidateReviewRecord[];
  resolution: ResolutionReportRecord[];
}

interface Placement {
  dataset: Dataset;
  context_type: ContextType;
  status: ResolutionStatus;
  notes: string;
  missing: string[];
}

function place(o: GapRecord): Placement {
  const t = o.likely_context_type;
  const from = o.seen_as.includes('from');
  const to = o.seen_as.includes('to');
  if (o.recommended_phase5_dataset === 'route-node-index') {
    return { dataset: 'route-node-candidate-review', context_type: 'route_node_candidate', status: 'pending', notes: 'recommended for route-node review; not promoted in Phase 5', missing: ['route_node_decision'] };
  }
  if (t === 'harbor') return { dataset: 'dropoff-contexts', context_type: 'harbor', status: 'resolved', notes: 'harbor crossing/dropoff handoff', missing: ['ferry_or_transfer_timing'] };
  if (t === 'airport') {
    return from
      ? { dataset: 'pickup-contexts', context_type: 'airport', status: 'resolved', notes: 'airport pickup handoff', missing: ['buffer_minutes'] }
      : { dataset: 'dropoff-contexts', context_type: 'airport', status: 'resolved', notes: 'airport dropoff handoff', missing: ['buffer_minutes'] };
  }
  if (t === 'staging_area') return { dataset: 'staging-area-contexts', context_type: 'staging_area', status: 'resolved', notes: 'staging/transit context', missing: ['operational_rule_source'] };
  if (t === 'hotel_area') {
    return from
      ? { dataset: 'pickup-contexts', context_type: 'hotel_area', status: 'resolved', notes: 'hotel pickup context', missing: ['buffer_minutes', 'operational_rule_source'] }
      : { dataset: 'operational-context-index', context_type: 'hotel_area', status: 'partially_resolved', notes: 'hotel seen only as dropoff target; needs operational rule source', missing: ['operational_rule_source'] };
  }
  if (t === 'city_area') return { dataset: 'operational-context-index', context_type: 'city_area', status: 'partially_resolved', notes: 'city area; candidate for location-alias-registry in a later phase', missing: ['alias_registry_resolution'] };
  return { dataset: 'operational-context-index', context_type: 'unknown', status: 'pending', notes: 'unclassified; needs source confirmation', missing: ['context_classification_source'] };
}

export async function buildOperationalContext(dir: string = GENERATED_DIR): Promise<OperationalContextBundle> {
  const generated_at = inventoryGeneratedAt();
  const gaps = await readJson<GapRecord[]>(`${dir}/operational-context-gap-report.json`);
  const backoffice = await extractBackoffice();

  const trace = (label: string): InventorySourceTrace[] => [{ repo: JVTO_REPO, path: DETAIL_PATH, field: label }];

  const placed = gaps.map((o) => ({ o, pl: place(o) }));

  const index: OpContextIndexRecord[] = placed.map(({ o, pl }) => ({
    ...baseRecord(`opindex__${o.normalized_candidate_id}`, trace(o.label), {
      generated_at,
      confidence: pl.status === 'resolved' ? 'medium' : 'low',
      status: pl.status === 'resolved' ? 'active' : 'incomplete',
      missing_fields: pl.missing
    }),
    label: o.label,
    normalized_candidate_id: o.normalized_candidate_id,
    context_type: pl.context_type,
    seen_in_packages: o.seen_in_packages,
    seen_as: o.seen_as,
    source_recommendation: o.recommended_phase5_dataset,
    resolved_phase5_dataset: pl.dataset,
    resolution_status: pl.status,
    notes: pl.notes
  }));

  const pickup: PickupContextRecord[] = placed
    .filter(({ pl }) => pl.dataset === 'pickup-contexts')
    .map(({ o, pl }) => {
      const generic = o.label.trim().toLowerCase() === 'hotel';
      return {
        ...baseRecord(`pickup__${o.normalized_candidate_id}`, trace(o.label), {
          generated_at,
          confidence: 'low',
          status: generic ? 'incomplete' : 'active',
          missing_fields: pl.missing
        }),
        context_id: `pickup__${o.normalized_candidate_id}`,
        label: o.label,
        normalized_candidate_id: o.normalized_candidate_id,
        context_type: pl.context_type,
        applies_to_packages: o.seen_in_packages,
        seen_as: o.seen_as,
        rules: [], // no buffers invented — source provides none
        unresolved_reason: generic ? 'generic_hotel_label_no_specific_area' : null
      };
    });

  const dropoff: DropoffContextRecord[] = placed
    .filter(({ pl }) => pl.dataset === 'dropoff-contexts')
    .map(({ o, pl }) => ({
      ...baseRecord(`dropoff__${o.normalized_candidate_id}`, trace(o.label), {
        generated_at,
        confidence: 'medium',
        status: 'active',
        missing_fields: pl.missing
      }),
      context_id: `dropoff__${o.normalized_candidate_id}`,
      label: o.label,
      normalized_candidate_id: o.normalized_candidate_id,
      context_type: pl.context_type,
      applies_to_packages: o.seen_in_packages,
      seen_as: o.seen_as,
      handoff_notes:
        pl.context_type === 'harbor'
          ? ['harbor/ferry crossing handoff', 'ferry buffer and Bali transfer cost NOT inferred']
          : ['airport dropoff handoff', 'departure buffer NOT inferred']
    }));

  const staging: StagingContextRecord[] = placed
    .filter(({ pl }) => pl.dataset === 'staging-area-contexts')
    .map(({ o, pl }) => ({
      ...baseRecord(`staging__${o.normalized_candidate_id}`, trace(o.label), {
        generated_at,
        confidence: 'low',
        status: 'incomplete',
        missing_fields: pl.missing
      }),
      context_id: `staging__${o.normalized_candidate_id}`,
      label: o.label,
      normalized_candidate_id: o.normalized_candidate_id,
      applies_to_packages: o.seen_in_packages,
      seen_as: o.seen_as,
      staging_notes: ['generic staging/transit label', 'not promoted to route node']
    }));

  const nodeReview: NodeCandidateReviewRecord[] = placed
    .filter(({ pl }) => pl.dataset === 'route-node-candidate-review')
    .map(({ o }) => ({
      ...baseRecord(`nodereview__${o.normalized_candidate_id}`, trace(o.label), {
        generated_at,
        confidence: 'low',
        status: 'incomplete',
        missing_fields: ['route_node_decision']
      }),
      candidate_id: `nodereview__${o.normalized_candidate_id}`,
      label: o.label,
      normalized_candidate_id: o.normalized_candidate_id,
      seen_in_packages: o.seen_in_packages,
      seen_as: o.seen_as,
      evidence_strength: o.seen_in_packages.length >= 5 ? 'medium' : 'low',
      recommended_action: o.seen_in_packages.length >= 5 ? 'review_for_future_route_node' : 'needs_source_confirmation',
      reason: 'appears as a TravelAction movement label but is not a slug-derived destination node',
      review_status: 'pending_review'
    }));

  // ── time-window-rules: backoffice buckets + conservative per-context rules ──
  const idToSlug = new Map<number, string>();
  for (const p of backoffice.package_registry) if (p.slug) idToSlug.set(p.id, p.slug);

  const timeRules: TimeWindowRuleRecord[] = [];
  const boTrace: InventorySourceTrace[] = [{ repo: BO_REPO, path: BUNDLE_PATH, field: 'booking_logistics_patterns' }];
  // Reload raw bundle logistics patterns deterministically via the connected extract's pickup patterns.
  for (const pat of backoffice.pickup_patterns) {
    for (const b of pat.time_buckets) {
      timeRules.push({
        ...baseRecord(`time__bucket__${pat.location_group.toLowerCase().replace(/[^a-z0-9]+/g, '_')}__${b.bucket}`, boTrace, {
          generated_at,
          confidence: 'medium',
          status: 'active',
          missing_fields: ['exact_time_source']
        }),
        rule_id: `time__bucket__${pat.location_group.toLowerCase().replace(/[^a-z0-9]+/g, '_')}__${b.bucket}`,
        source_context_id: null,
        rule_type: 'pickup_time_bucket',
        applies_to_packages: pat.package_ids.map((id) => idToSlug.get(id) ?? String(id)).sort(),
        source_time_bucket: b.bucket,
        exact_time_available: false
      });
    }
  }

  const RULE_TYPE_BY_CTX: Record<string, TimeWindowRuleRecord['rule_type']> = {
    harbor: 'harbor_crossing_context',
    airport: 'airport_handoff_context',
    hotel_area: 'hotel_staging_context',
    staging_area: 'unknown_time_context'
  };
  for (const { o, pl } of placed) {
    if (!['pickup-contexts', 'dropoff-contexts', 'staging-area-contexts'].includes(pl.dataset)) continue;
    const prefix = pl.dataset === 'pickup-contexts' ? 'pickup' : pl.dataset === 'dropoff-contexts' ? 'dropoff' : 'staging';
    timeRules.push({
      ...baseRecord(`time__ctx__${o.normalized_candidate_id}`, trace(o.label), {
        generated_at,
        confidence: 'low',
        status: 'incomplete',
        missing_fields: ['exact_time_source']
      }),
      rule_id: `time__ctx__${o.normalized_candidate_id}`,
      source_context_id: `${prefix}__${o.normalized_candidate_id}`,
      rule_type: RULE_TYPE_BY_CTX[pl.context_type] ?? 'unknown_time_context',
      applies_to_packages: o.seen_in_packages,
      source_time_bucket: null,
      exact_time_available: false
    });
  }
  timeRules.sort((a, b) => a.rule_id.localeCompare(b.rule_id));

  const resolution: ResolutionReportRecord[] = placed
    .map(({ o, pl }) => ({
      ...baseRecord(`resolution__${o.normalized_candidate_id}`, trace(o.label), {
        generated_at,
        confidence: pl.status === 'resolved' ? 'medium' : 'low',
        status: pl.status === 'resolved' ? 'active' : 'incomplete',
        missing_fields: pl.missing
      }),
      label: o.label,
      original_recommended_phase5_dataset: o.recommended_phase5_dataset,
      resolved_dataset: pl.dataset,
      resolution_status: pl.status,
      reason: pl.notes,
      remaining_missing_fields: pl.missing
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { index, pickup, dropoff, staging, timeRules, nodeReview, resolution };
}
