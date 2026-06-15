import type { TimeWindowRule } from '../domain/operations.js';
import type { BackofficeExtract } from '../extract/sourceTypes.js';
import { backofficeTrace, bumpConfidence, lateArrivalEvidence } from './backoffice-enrich.js';

export function buildTimeWindowRules(backoffice?: BackofficeExtract): TimeWindowRule[] {
  const rules: TimeWindowRule[] = [
    {
      id: 'late_arrival_before_ijen',
      label: 'Late arrival before Ijen',
      status: 'active',
      confidence: 'manual_seed',
      condition: { next_activity: 'Ijen', hotel_arrival_after: '21:00' },
      impact: ['reduced_rest_time', 'late_medical_screening', 'higher_fatigue', 'ijen_midnight_departure_risk'],
      recommendation: 'Add one night or adjust route so Ijen is not performed after late arrival.',
      severity: 'high',
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/time-window-rules.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'late_surabaya_arrival_before_bromo',
      label: 'Late Surabaya arrival before Bromo sunrise',
      status: 'active',
      confidence: 'manual_seed',
      condition: { pickup_area: 'Surabaya', arrival_after: '17:00', next_activity: 'Bromo Sunrise' },
      impact: ['late_checkin', 'reduced_sleep', 'higher_fatigue'],
      recommendation: 'Possible but tiring. Earlier arrival or one extra night gives a better guest experience.',
      severity: 'medium',
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/time-window-rules.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'airport_dropoff_cutoff_after_waterfall',
      label: 'Airport dropoff cutoff after waterfall activity',
      status: 'active',
      confidence: 'manual_seed',
      condition: { dropoff_type: 'airport', previous_activity: ['Tumpak Sewu', 'Madakaripura'], minimum_flight_buffer_minutes: 180 },
      impact: ['flight_miss_risk', 'activity_skip_may_be_needed'],
      recommendation: 'Avoid tight flights after waterfall activities. Skip the waterfall or add one night if the flight is too early.',
      severity: 'high',
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/time-window-rules.yaml', confidence: 'manual_seed' }]
    }
  ];

  if (!backoffice) return rules;

  const evidenceById: Record<string, Record<string, unknown> | null> = {
    late_arrival_before_ijen: lateArrivalEvidence(backoffice, { destination: 'Ijen' }),
    late_surabaya_arrival_before_bromo: lateArrivalEvidence(backoffice, {
      pickupGroups: ['Surabaya', 'Surabaya Airport', 'Airport'],
      destination: 'Bromo'
    })
  };

  for (const rule of rules) {
    const observed = evidenceById[rule.id];
    if (!observed) continue;
    rule.confidence = bumpConfidence(rule.confidence);
    rule.source_trace.push(backofficeTrace('late-arrival frequency (booking_logistics_patterns)'));
    rule.backoffice_observed = observed;
  }

  return rules;
}
