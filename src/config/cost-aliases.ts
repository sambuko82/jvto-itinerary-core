// Cost-ID alias layer.
//
// Route legs (04), destination profiles (06), and operational events (07) tag
// their cost impacts with SEMANTIC tags (e.g. `vehicle_day_usage`, `bromo_ticket`,
// `medical_check`). The canonical cost-component REGISTRY is `10-cost-components.json`
// (e.g. `vehicle_private_car_day`, `bromo_entrance_fee`, `ijen_medical_check`).
//
// These two vocabularies diverged. This map is the single place that resolves a
// semantic tag to a canonical registry ID so that:
//   - the scenario evaluator emits ONLY canonical `10` IDs (joinable downstream), and
//   - the validator can assert every tag in 04/06/07 resolves to a real `10` ID
//     (drift fails the build).
//
// A tag that is ALREADY a canonical `10` ID needs no entry here — resolveCostId
// returns it as-is. Only non-canonical semantic tags need a mapping.

export const COST_ALIASES: Record<string, string> = {
  // vehicle / transport
  vehicle_day_usage: 'vehicle_private_car_day',
  ketapang_dropoff: 'vehicle_private_car_day',
  vehicle_crossing_or_handoff: 'ferry_ticket',
  // park / activity tickets
  bromo_ticket: 'bromo_entrance_fee',
  ijen_ticket: 'ijen_entrance_fee',
  madakaripura_ticket: 'destination_ticket',
  tumpak_sewu_ticket: 'destination_ticket',
  papuma_ticket: 'destination_ticket',
  destination_ticket_if_selected: 'destination_ticket',
  // ijen prep
  medical_check: 'ijen_medical_check',
  ijen_preparation: 'ijen_medical_check',
  // meals
  dinner_bondowoso: 'restaurant_meal',
  lunch_after_tumpak_sewu: 'restaurant_meal',
  // lodging
  hotel_bromo_area: 'hotel_room',
  // guides
  waterfall_local_guide: 'madakaripura_local_guide',
  // bali transfer / dropoff extras
  optional_bali_transfer: 'bali_dropoff_after_ketapang',
  bali_transfer: 'bali_dropoff_after_ketapang',
  bali_transfer_optional: 'bali_dropoff_after_ketapang'
};

// Resolve a cost tag to a canonical `10` ID, or null if it cannot be joined.
// `canonical` is the set of IDs present in 10-cost-components.json.
export function resolveCostId(tag: string, canonical: ReadonlySet<string>): string | null {
  if (canonical.has(tag)) return tag;
  const aliased = COST_ALIASES[tag];
  if (aliased && canonical.has(aliased)) return aliased;
  return null;
}
