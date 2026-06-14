import type { RoadSituationProfile } from '../domain/operations.js';

export function buildRoadSituationProfiles(): RoadSituationProfile[] {
  return [
    {
      id: 'waterfall_access_road',
      label: 'Waterfall access road',
      status: 'active',
      confidence: 'manual_seed',
      applies_to: ['Tumpak Sewu', 'Madakaripura'],
      risks: ['rain', 'slippery access', 'local access control', 'longer walking transfer'],
      recommendation_logic: [
        { condition: 'heavy_rain', recommendation: 'Reconfirm accessibility before entering waterfall route.' },
        { condition: 'tight_airport_deadline', recommendation: 'Avoid waterfall activity before airport dropoff.' }
      ],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/road-situation-profiles.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'night_mountain_drive',
      label: 'Night mountain drive',
      status: 'active',
      confidence: 'manual_seed',
      applies_to: ['Bromo', 'Ijen'],
      risks: ['reduced visibility', 'driver fatigue', 'guest fatigue', 'cold weather preparation'],
      recommendation_logic: [
        { condition: 'long_haul_arrival_same_day', recommendation: 'Add rest buffer or overnight before midnight trekking/sunrise activity.' }
      ],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/road-situation-profiles.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'ferry_crossing',
      label: 'Ferry crossing',
      status: 'active',
      confidence: 'manual_seed',
      applies_to: ['Ketapang', 'Gilimanuk', 'Bali transfer'],
      risks: ['queue', 'crossing delay', 'late hotel arrival in Bali'],
      recommendation_logic: [
        { condition: 'late_ijen_finish', recommendation: 'Add buffer for ferry queue and Bali-side traffic.' }
      ],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/road-situation-profiles.yaml', confidence: 'manual_seed' }]
    }
  ];
}
