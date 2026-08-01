import type { OperationalEvent } from '../domain/operations.js';

const RESEARCH_REF = 'seed/research/east-java-field-data-2026.json';

/**
 * Attach the Kawah Ijen crater health-certificate requirement to the
 * `ijen_access_requirements` access-requirements event.
 *
 * The gear/permit/guide fields on that event are promoted from the jvto-web
 * destinationDetail snapshot (see jvto-web-enrich.ts). The health-certificate
 * requirement is a distinct, regulatory access gate that the snapshot does not
 * carry. It is extracted from the in-repo field research
 * (`ijen_rules.medical_check`): a mandatory surat-sehat (doctor health
 * certificate) checked at the barcode-to-hiking-ticket exchange, effective
 * 2024-01-06, with an on-site issuance option at the Paltuding Pos Kesehatan
 * Pariwisata. Values are copied from that research block with a manual_seed /
 * RESEARCH_REF source_trace (matching the convention in build-cost-components.ts
 * and build-recommendation-rules.ts) — facts only, no operator-workflow or
 * presentation copy authored here.
 *
 * Additive and id-scoped: only the `ijen_access_requirements` event is touched,
 * so the scenario evaluator output is unchanged. Returns true when the target
 * event was present and enriched, false otherwise (no fabrication).
 */
export function enrichIjenHealthRequirement(events: OperationalEvent[]): boolean {
  const event = events.find((e) => e.id === 'ijen_access_requirements');
  if (!event) return false;

  event.health_certificate_required = true;
  event.health_screening = {
    mandatory: true,
    document: 'Surat keterangan sehat (doctor health certificate)',
    checked_at: 'barcode-to-hiking-ticket exchange (crater access gate)',
    effective: '2024-01-06',
    on_site_option:
      'From Feb 2025: Pos Kesehatan Pariwisata at Paltuding parking issues it on-site for IDR 20,000/person',
    criteria:
      'No asthma/heart-disease history; physically + mentally fit; on-site checks blood pressure, SpO2, height/weight',
    validity: '~1 week',
    rationale: 'Altitude >2000 m plus toxic sulfur gas exposure'
  };
  event.source_trace.push({
    source: 'manual_seed',
    ref: RESEARCH_REF,
    field: 'ijen_rules.medical_check',
    confidence: 'inferred'
  });

  return true;
}
