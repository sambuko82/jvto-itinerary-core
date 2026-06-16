import type { BaseEntity, BackofficeObserved } from './common.js';

export interface RiskFactor {
  type: string | null;
  level: string | null;
  mitigation: string | null;
  description: string | null;
}

export interface RecommendationRule extends BaseEntity {
  condition: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
  alternatives?: string[];
  // Promoted from jvto-web destination intelligence (weather / rainfall / risk).
  weather_by_season?: string | null;
  rainfall_intensity?: string | null;
  risk_factors?: RiskFactor[];
  backoffice_observed?: BackofficeObserved;
}

export interface MapPoint {
  type: 'pickup' | 'dropoff' | 'destination' | 'hotel_area' | 'activity' | 'warning';
  label: string;
  location_ref?: string;
  lat?: number;
  lng?: number;
}

export interface VisualMapLayer extends BaseEntity {
  points: MapPoint[];
  route_legs: string[];
  display_notes?: string[];
}

export interface OutputTemplateMap extends BaseEntity {
  output_mode: 'customer_pdf' | 'website_page' | 'quotation' | 'whatsapp_summary' | 'internal_ops_sheet' | 'map_payload';
  required_sections: string[];
  data_dependencies: string[];
}
