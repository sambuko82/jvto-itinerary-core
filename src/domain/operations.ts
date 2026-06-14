import type { BaseEntity } from './common.js';

export interface TimeWindowRule extends BaseEntity {
  condition: Record<string, unknown>;
  impact: string[];
  recommendation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface RoadSituationProfile extends BaseEntity {
  applies_to: string[];
  risks: string[];
  recommendation_logic: Array<{
    condition: string;
    recommendation: string;
  }>;
}

export interface DestinationActivityProfile extends BaseEntity {
  destination_id: string;
  activity_window: Record<string, string>;
  dependencies: string[];
  required_prior_events?: string[];
  fatigue_score: number;
  best_previous_overnight?: string;
  bad_previous_overnight?: string[];
  cost_components: string[];
  warning_rules?: string[];
}

export interface OperationalEvent extends BaseEntity {
  event_type: string;
  applies_when: string[];
  typical_sequence?: string[];
  minimum_recommended_arrival_time?: string;
  latest_tolerable_arrival_time?: string;
  risk_if_late?: string[];
  customer_visible: boolean;
  cost_components?: string[];
}

export interface MealLogic extends BaseEntity {
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'water';
  included: boolean | 'depends_on_package';
  applies_when: string[];
  customer_note?: string;
  cost_components?: string[];
}

export interface AccommodationLogic extends BaseEntity {
  area_id: string;
  purpose: string;
  recommended_for: string[];
  operational_notes: string[];
  risk_if_arrival_late?: string[];
  cost_components?: string[];
}
