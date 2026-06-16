import type { DestinationActivityProfile } from '../domain/operations.js';
import type { BackofficeExtract } from '../extract/sourceTypes.js';
import { activityProfileObserved, backofficeTrace, bumpConfidence } from './backoffice-enrich.js';

export function buildDestinationActivityProfiles(backoffice?: BackofficeExtract): DestinationActivityProfile[] {
  const profiles: DestinationActivityProfile[] = [
    {
      id: 'destination_bromo_activity_profile',
      label: 'Mount Bromo activity profile',
      status: 'active',
      confidence: 'manual_seed',
      destination_id: 'bromo',
      activity_window: {
        jeep_pickup: '02:30–03:30',
        sunrise: '04:30–06:00',
        crater_visit: '06:00–08:00',
        finish: '08:00–09:30'
      },
      dependencies: ['jeep', 'weather', 'national_park_access'],
      fatigue_score: 3,
      best_previous_overnight: 'Bromo Area',
      bad_previous_overnight: ['Surabaya unless midnight tour', 'late airport arrival without rest'],
      cost_components: ['bromo_ticket', 'bromo_jeep'],
      warning_rules: ['late_surabaya_arrival_before_bromo'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/destination-activity-profiles.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'destination_ijen_activity_profile',
      label: 'Ijen activity profile',
      status: 'active',
      confidence: 'manual_seed',
      destination_id: 'ijen',
      activity_window: {
        hotel_departure: '00:00',
        trek_start: '02:00',
        sunrise_crater: '05:00–06:00',
        finish: '07:00–08:00'
      },
      required_prior_events: ['dinner', 'medical_check', 'guide_briefing', 'equipment_distribution'],
      dependencies: ['health_screening', 'local_guide', 'gas_mask', 'weather', 'monthly_closure'],
      fatigue_score: 5,
      best_previous_overnight: 'Bondowoso / Ijen Area',
      bad_previous_overnight: ['late arrival after long transfer', 'no rest before midnight departure'],
      cost_components: ['ijen_ticket', 'ijen_local_guide', 'gas_mask', 'medical_check'],
      warning_rules: ['late_arrival_before_ijen'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/destination-activity-profiles.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'destination_tumpak_sewu_activity_profile',
      label: 'Tumpak Sewu activity profile',
      status: 'active',
      confidence: 'manual_seed',
      destination_id: 'tumpak_sewu',
      activity_window: {
        recommended_start: '07:00–08:00',
        finish: '11:00–13:00'
      },
      dependencies: ['local_guide', 'weather', 'waterfall_access_condition'],
      fatigue_score: 5,
      cost_components: ['tumpak_sewu_ticket', 'tumpak_sewu_local_guide', 'lunch_after_tumpak_sewu'],
      warning_rules: ['waterfall_access_road', 'airport_dropoff_cutoff_after_waterfall'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/destination-activity-profiles.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'destination_madakaripura_activity_profile',
      label: 'Madakaripura activity profile',
      status: 'active',
      confidence: 'manual_seed',
      destination_id: 'madakaripura',
      activity_window: {
        recommended_start: '08:00–12:00',
        finish: '11:00–15:00'
      },
      dependencies: ['local_guide', 'weather', 'waterfall_access_condition'],
      fatigue_score: 3,
      cost_components: ['madakaripura_ticket', 'madakaripura_local_guide'],
      warning_rules: ['waterfall_access_road', 'airport_dropoff_cutoff_after_waterfall'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/destination-activity-profiles.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'destination_papuma_activity_profile',
      label: 'Papuma activity profile',
      status: 'active',
      confidence: 'manual_seed',
      destination_id: 'papuma',
      activity_window: {
        recommended_start: '08:00-14:00',
        finish: '10:00-16:00'
      },
      dependencies: ['weather', 'coastal_access_condition'],
      fatigue_score: 2,
      best_previous_overnight: 'Jember / Bondowoso corridor',
      bad_previous_overnight: ['tight airport deadline', 'late long-haul transfer'],
      cost_components: ['papuma_ticket', 'vehicle_day_usage'],
      warning_rules: ['rain_sensitive_road'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/destination-activity-profiles.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'destination_malang_batu_activity_profile',
      label: 'Malang / Batu activity profile',
      status: 'active',
      confidence: 'manual_seed',
      destination_id: 'malang_batu',
      activity_window: {
        city_activity: '09:00-17:00',
        evening_activity: '18:00-21:00'
      },
      dependencies: ['city_traffic', 'attraction_opening_hours'],
      fatigue_score: 2,
      best_previous_overnight: 'Malang / Batu',
      bad_previous_overnight: ['post-Ijen same day without rest'],
      cost_components: ['vehicle_day_usage', 'destination_ticket_if_selected'],
      warning_rules: ['weekend_congestion'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/destination-activity-profiles.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'destination_surabaya_city_activity_profile',
      label: 'Surabaya city activity profile',
      status: 'active',
      confidence: 'manual_seed',
      destination_id: 'surabaya_city',
      activity_window: {
        city_activity: '09:00-17:00',
        airport_buffer_sensitive: 'depends_on_departure_time'
      },
      dependencies: ['city_traffic', 'airport_or_train_deadline'],
      fatigue_score: 1,
      best_previous_overnight: 'Surabaya',
      bad_previous_overnight: ['tight airport deadline after long transfer'],
      cost_components: ['vehicle_day_usage', 'parking_toll_fuel_allowance'],
      warning_rules: ['airport_dropoff_cutoff_after_waterfall'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/destination-activity-profiles.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'destination_bali_ketapang_activity_profile',
      label: 'Bali / Ketapang connection profile',
      status: 'active',
      confidence: 'manual_seed',
      destination_id: 'bali_ketapang',
      activity_window: {
        ferry_connection: '24_hours_with_queue_variability',
        bali_transfer: 'depends_on_hotel_area'
      },
      dependencies: ['ferry_crossing', 'bali_traffic', 'handoff_or_vehicle_crossing'],
      fatigue_score: 2,
      best_previous_overnight: 'Banyuwangi / Ijen Area',
      bad_previous_overnight: ['late Ijen finish with far Bali hotel deadline'],
      cost_components: ['ferry_ticket', 'bali_transfer', 'vehicle_crossing_or_handoff'],
      warning_rules: ['harbor_dropoff_requires_ferry_buffer'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/destination-activity-profiles.yaml', confidence: 'manual_seed' }]
    }
  ];

  if (!backoffice) return profiles;

  for (const profile of profiles) {
    const observed = activityProfileObserved(backoffice, profile.destination_id);
    if (!observed) continue;
    profile.confidence = bumpConfidence(profile.confidence);
    profile.source_trace.push(backofficeTrace('activity cost/unit/formula (destination_activities, other_activities)'));
    profile.backoffice_observed = observed;
  }

  return profiles;
}
