import type { DestinationActivityProfile, OperationalEvent } from '../domain/operations.js';
import type { RecommendationRule, RiskFactor } from '../domain/output.js';
import type { SourceTrace } from '../domain/common.js';
import type { JvtoWebDestinationDetail, JvtoWebExtract } from '../extract/extractTypes.js';
import { DESTINATION_CROSSWALK } from '../config/destination-crosswalk.js';

/**
 * Promote jvto-web destination intelligence into the generated datasets.
 *
 * These 11 fields already exist at source (input/jvto-web destinationDetail
 * snapshot) but were not promoted into generated intelligence (flagged by the
 * data-readiness report as `source_exists_not_promoted`). Per that report's
 * mapping they land in:
 *   06 destination profiles  ← physical_demand, difficulty_level, altitude, trail_details
 *   07 operational events     ← required_gear, permit_required, permit_details, guide_required
 *   12 recommendation rules   ← risk_factors, weather_by_season, rainfall_intensity
 *
 * The promotion is additive: 06 records gain an evidence block + jvto_web
 * source_trace; 07/12 gain new per-destination records the evaluator does not
 * emit (its applicability allow-lists are id-specific), so scenario output is
 * unchanged. No data is authored — only copied from source with provenance.
 */

const JW_REF = 'jvto-web:publicContent/generated/destinationDetailSnapshots.json';

const SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
type Severity = 'low' | 'medium' | 'high' | 'critical';

function jwTrace(field: string): SourceTrace {
  return { source: 'jvto_web', ref: JW_REF, field, confidence: 'inferred' };
}

function coreIdForSlug(slug: string): string | null {
  return DESTINATION_CROSSWALK.find((x) => x.slug === slug)?.coreId ?? null;
}

function severityFromRisks(risks: RiskFactor[]): Severity {
  let best: Severity = 'low';
  for (const r of risks) {
    const lvl = (r.level ?? '').toLowerCase();
    if ((SEVERITY_RANK[lvl] ?? 0) > SEVERITY_RANK[best]) best = lvl as Severity;
  }
  return best;
}

function rankOf(r: RiskFactor): number {
  return SEVERITY_RANK[(r.level ?? '').toLowerCase()] ?? 0;
}

function recommendationText(d: JvtoWebDestinationDetail): string {
  const name = d.name ?? d.slug;
  const parts: string[] = [`${name}: difficulty ${d.difficulty_level ?? 'n/a'} (physical demand ${d.physical_demand ?? 'n/a'}/5).`];
  if (d.weather_by_season) parts.push(`Weather by season — ${d.weather_by_season}`);
  if (d.rainfall_intensity) parts.push(`Rainfall — ${d.rainfall_intensity}`);
  const top = [...d.risk_factors].sort((a, b) => rankOf(b) - rankOf(a))[0];
  if (top && (top.mitigation || top.description)) {
    parts.push(`Key risk (${top.type ?? 'general'}, ${top.level ?? 'n/a'}): ${top.mitigation ?? top.description}`);
  }
  return parts.join(' ');
}

/**
 * Promote in place. Returns the number of destinations whose intelligence was
 * promoted (0 when the source snapshot is absent — no promotion, no fabrication).
 */
export function promoteJvtoWebDestinationIntelligence(
  jvtoWeb: JvtoWebExtract,
  profiles: DestinationActivityProfile[],
  events: OperationalEvent[],
  rules: RecommendationRule[]
): number {
  const details = jvtoWeb.destination_details ?? [];
  if (!details.length) return 0;
  const bySlug = new Map(details.map((d) => [d.slug, d]));

  // 06 — attach destination_intelligence block + source_trace to the matching profile.
  for (const p of profiles) {
    const entry = DESTINATION_CROSSWALK.find((x) => x.coreId === p.destination_id);
    const d = entry?.slug ? bySlug.get(entry.slug) : undefined;
    if (!d) continue;
    p.destination_intelligence = {
      physical_demand: d.physical_demand,
      difficulty_level: d.difficulty_level,
      altitude: d.altitude,
      trail_details: d.trail_details
    };
    p.source_trace.push(jwTrace('physical_demand, difficulty_level, altitude, trail_details'));
    if (p.confidence === 'manual_seed') p.confidence = 'inferred';
  }

  // 07 — per-destination access-requirements event (gear / permits / guide).
  for (const d of details) {
    const core = coreIdForSlug(d.slug);
    if (!core) continue;
    if (!d.required_gear.length && d.permit_required == null && d.guide_required == null) continue;
    events.push({
      id: `${core}_access_requirements`,
      label: `${d.name ?? core} access requirements (gear, permits, guide)`,
      status: 'active',
      confidence: 'inferred',
      event_type: 'destination_access_requirements',
      applies_when: [`destination includes ${core}`],
      customer_visible: true,
      cost_components: [],
      required_gear: d.required_gear,
      permit_required: d.permit_required,
      permit_details: d.permit_details,
      guide_required: d.guide_required,
      source_trace: [jwTrace('required_gear, permit_required, permit_details, guide_required')]
    });
  }

  // 12 — per-destination weather/risk advisory rule.
  for (const d of details) {
    const core = coreIdForSlug(d.slug);
    if (!core) continue;
    if (!d.risk_factors.length && !d.weather_by_season && !d.rainfall_intensity) continue;
    rules.push({
      id: `${core}_weather_risk_advisory`,
      label: `${d.name ?? core} weather and risk advisory`,
      status: 'active',
      confidence: 'inferred',
      condition: { route_includes_destination: core },
      severity: severityFromRisks(d.risk_factors),
      recommendation: recommendationText(d),
      weather_by_season: d.weather_by_season,
      rainfall_intensity: d.rainfall_intensity,
      risk_factors: d.risk_factors,
      source_trace: [jwTrace('risk_factors, weather_by_season, rainfall_intensity')]
    });
  }

  return details.length;
}
