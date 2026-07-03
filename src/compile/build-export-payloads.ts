import { EXPORT_DIR } from '../config/paths.js';
import { buildScenarioPreview } from './build-scenario-preview.js';
import type { VisualMapLayer } from '../domain/output.js';
import type { PackageScenarioContext } from './build-package-scenario-context.js';

const scenarioPreview = buildScenarioPreview();

const sharedMissingData = [
  'distance_km requires Mapbox/manual verification',
  'route_lines are great-circle placeholders, not routed road polylines',
  'actual vehicle/crew/hotel/activity rates require redacted backoffice export ingestion',
  'no raw customer PII is included in this sample payload'
];

export function buildExportPayloads(packageContext: PackageScenarioContext, mapLayer: VisualMapLayer) {
  const base = {
    scenario_id: scenarioPreview.scenario.scenario_id,
    source_mode: 'manual_seed_mvp',
    status: scenarioPreview.status,
    generated_at: 'manual_seed_deterministic',
    pii_policy: 'no_raw_customer_pii',
    missing_data: sharedMissingData,
    // Package-aware scenario result threaded through every payload (PII-free:
    // canonical cost IDs + aggregated package structure, no rates/totals).
    package_context: packageContext
  };

  return [
    {
      path: `${EXPORT_DIR}/page-payload/sample-itinerary-page.json`,
      data: {
        ...base,
        payload_type: 'website_page',
        page_model: {
          title: 'Private Surabaya to Bromo, Madakaripura, Ijen and Ketapang 3D2N',
          route_summary: scenarioPreview.recommended_route_sequence,
          hero_context: 'Manual-seed MVP payload for a custom private itinerary page.',
          sections: ['route_overview', 'daily_itinerary', 'pickup_dropoff', 'map', 'warnings', 'next_required_info'],
          map_layer_id: mapLayer.id,
          route_leg_ids: scenarioPreview.route_leg_ids,
          warnings: scenarioPreview.warnings,
          better_route_notes: scenarioPreview.better_route_notes,
          package_baseline: {
            package_route_id: packageContext.package_route_id,
            route_summary: packageContext.recommended_route_sequence,
            day_count: (packageContext.package_structure?.day_count as number | undefined) ?? null,
            hotel_count: (packageContext.package_structure?.hotel_count as number | undefined) ?? null,
            destination_core_ids: (packageContext.package_structure?.destination_core_ids as string[] | undefined) ?? []
          }
        },
        map_payload: {
          points: mapLayer.points.map((point) => ({
            ...point,
            coordinate_status: point.geo_status
          })),
          bounds: mapLayer.bounds ?? null,
          route_lines: mapLayer.route_lines ?? [],
          route_legs: scenarioPreview.route_legs
        }
      }
    },
    {
      path: `${EXPORT_DIR}/pdf-payload/sample-itinerary-pdf.json`,
      data: {
        ...base,
        payload_type: 'customer_pdf',
        document_model: {
          title: 'JVTO Custom Itinerary Preview',
          route_sequence: scenarioPreview.recommended_route_sequence,
          pickup: scenarioPreview.normalized_pickup,
          dropoff: scenarioPreview.normalized_dropoff,
          operational_events: scenarioPreview.operational_events,
          meal_events: scenarioPreview.meal_events,
          accommodation_logic: scenarioPreview.accommodation_logic,
          customer_notes: scenarioPreview.warnings,
          cost_note: 'This MVP maps cost components only; it does not calculate a final quotation.'
        }
      }
    },
    {
      path: `${EXPORT_DIR}/whatsapp-payload/sample-whatsapp-summary.json`,
      data: {
        ...base,
        payload_type: 'whatsapp_summary',
        summary_model: {
          opening: 'Feasible with warning: Surabaya 17:30 arrival can continue to Bromo, Madakaripura, Ijen, and Ketapang in 3D2N, but rest time is tight.',
          route: scenarioPreview.recommended_route_sequence.join(' -> '),
          key_warnings: scenarioPreview.warnings,
          better_route_notes: scenarioPreview.better_route_notes,
          next_required_info: [
            'flight_number',
            'origin_city',
            'next_destination_after_ketapang',
            'bali_transfer_preference_if_any'
          ],
          pii_handling: 'Collect actual contact details outside this generated sample payload.'
        }
      }
    },
    {
      path: `${EXPORT_DIR}/internal-ops-payload/sample-internal-ops.json`,
      data: {
        ...base,
        payload_type: 'internal_ops',
        ops_model: {
          route_leg_ids: scenarioPreview.route_leg_ids,
          operational_events: scenarioPreview.operational_events,
          meal_events: scenarioPreview.meal_events,
          accommodation_logic: scenarioPreview.accommodation_logic,
          cost_components: scenarioPreview.cost_components,
          package_route_id: packageContext.package_route_id,
          package_structure: packageContext.package_structure,
          verification_queue: [
            'confirm flight arrival and actual ready time',
            'confirm Bromo area hotel/staging plan',
            'verify Ijen medical check timing',
            'confirm Ketapang ferry/Bali transfer handoff',
            'replace null rates with redacted backoffice-derived rates'
          ]
        }
      }
    },
    {
      path: `${EXPORT_DIR}/ai-context-pack/sample-ai-context.json`,
      data: {
        ...base,
        payload_type: 'ai_context_pack',
        context_model: {
          decision_chain: 'travel scenario -> itinerary decision -> route feasibility -> operational execution -> cost model -> output document/page',
          scenario: scenarioPreview.scenario,
          normalized_pickup: scenarioPreview.normalized_pickup,
          normalized_dropoff: scenarioPreview.normalized_dropoff,
          recommended_route_sequence: scenarioPreview.recommended_route_sequence,
          warnings: scenarioPreview.warnings,
          better_route_notes: scenarioPreview.better_route_notes,
          cost_policy: 'Explain components and missing verified rates; do not invent a final price.',
          source_trace: scenarioPreview.source_trace
        }
      }
    }
  ];
}
