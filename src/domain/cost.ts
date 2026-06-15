import type { BaseEntity, BackofficeObserved } from './common.js';

export type CostCategory =
  | 'transport_day_cost'
  | 'transport_extra_dropoff'
  | 'parking_toll_fuel_allowance'
  | 'driver_cost'
  | 'escort_cost'
  | 'local_guide_cost'
  | 'destination_ticket'
  | 'jeep'
  | 'hotel_room'
  | 'hotel_meal'
  | 'restaurant_meal'
  | 'health_check'
  | 'equipment'
  | 'ferry'
  | 'add_on'
  | 'police_escort'
  | 'crew_cash'
  | 'actual_expense_calibration';

export interface CostComponent extends BaseEntity {
  category: CostCategory;
  unit: 'per_person' | 'per_vehicle' | 'per_room' | 'per_day' | 'per_group' | 'fixed' | 'formula';
  applies_when: string[];
  customer_visible: boolean | 'included_in_package';
  formula?: string;
  default_rate_idr?: number | null;
  channel_behavior?: string[];
  /** Researched rate breakdown (nationality/day-type/vehicle-class). See seed/research/*.json */
  rate_table_idr?: Record<string, unknown>;
  rate_note?: string;
  research_note?: string;
  backoffice_observed?: BackofficeObserved;
}
