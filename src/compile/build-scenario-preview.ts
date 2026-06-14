import type { ItineraryScenario } from '../domain/itinerary.js';

export function buildScenarioPreview() {
  const scenario: ItineraryScenario = {
    scenario_id: 'custom_surabaya_bromo_madakaripura_ijen_ketapang_3d2n',
    channel: 'CUSTOM',
    pickup: { type: 'airport', location: 'Surabaya Airport', time: '17:30' },
    dropoff: { type: 'harbor', location: 'Ketapang Harbor' },
    pax: 2,
    duration_days: 3,
    requested_destinations: ['Bromo', 'Madakaripura', 'Ijen'],
    arrival_time: '17:30'
  };

  return {
    scenario,
    status: 'possible_with_warning',
    recommended_route: ['Surabaya Airport', 'Bromo Area', 'Madakaripura', 'Bondowoso / Ijen Area', 'Ijen Crater', 'Ketapang Harbor'],
    warnings: [
      'Arrival at 17:30 may cause late check-in in Bromo area.',
      'Ijen requires midnight departure and health check before trekking.',
      'This route is feasible but tiring; earlier arrival or one extra night gives better rest.'
    ],
    operational_events: ['bromo_jeep_handoff', 'waterfall_local_guide_handoff', 'bondowoso_dinner_medical_check', 'ketapang_ferry_connection'],
    cost_components: ['vehicle_private_car_day', 'bromo_jeep', 'madakaripura_local_guide', 'ijen_medical_check', 'ijen_local_guide', 'bali_dropoff_after_ketapang_if_requested'],
    output_ready_for: ['customer_pdf', 'website_page', 'quotation', 'whatsapp_summary', 'internal_ops_sheet', 'map_payload']
  };
}
