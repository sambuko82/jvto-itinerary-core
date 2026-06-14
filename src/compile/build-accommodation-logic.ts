import type { AccommodationLogic } from '../domain/operations.js';

export function buildAccommodationLogic(): AccommodationLogic[] {
  return [
    {
      id: 'bondowoso_ijen_staging',
      label: 'Bondowoso / Ijen staging overnight',
      status: 'active',
      confidence: 'manual_seed',
      area_id: 'bondowoso_ijen_staging',
      purpose: 'overnight_before_ijen',
      recommended_for: ['Ijen from Surabaya', 'Bromo to Ijen route', 'Ijen before Ketapang/Bali dropoff'],
      operational_notes: ['medical check can be arranged at hotel', 'dinner before Ijen preparation', 'midnight departure to Ijen'],
      risk_if_arrival_late: ['less rest before Ijen', 'late dinner', 'late medical screening'],
      cost_components: ['hotel_ijen_area', 'dinner_bondowoso', 'medical_check'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/accommodation-logic.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'bromo_area_sunrise_staging',
      label: 'Bromo area sunrise staging overnight',
      status: 'active',
      confidence: 'manual_seed',
      area_id: 'bromo_area_sunrise_staging',
      purpose: 'overnight_before_bromo_sunrise',
      recommended_for: ['Bromo sunrise', 'Bromo + Madakaripura route', 'Bromo before Ijen transfer'],
      operational_notes: ['early jeep pickup', 'takeaway breakfast possible', 'cold-weather preparation'],
      risk_if_arrival_late: ['less rest before sunrise', 'late check-in', 'higher fatigue'],
      cost_components: ['hotel_bromo_area', 'bromo_jeep'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/accommodation-logic.yaml', confidence: 'manual_seed' }]
    }
  ];
}
