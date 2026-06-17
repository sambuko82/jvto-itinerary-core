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
  lat: number | null;
  lng: number | null;
  // Provenance of the coordinate: 'verified_jvto_web' when sourced from the
  // jvto-web destination registry, else an explicit gap marker.
  geo_status: 'verified_jvto_web' | 'needs_verified_geocode';
  geo_source: string | null;
}

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface RouteLine {
  leg_id: string;
  // 'great_circle_placeholder' is a straight Bezier-free segment between two
  // verified endpoints — NOT road geometry. null when an endpoint lacks coords.
  geometry_type: 'great_circle_placeholder' | null;
  not_road_geometry: true;
  geometry_status: 'placeholder_from_verified_endpoints' | 'needs_endpoint_coordinates';
  coordinates: [number, number][] | null;
  distance_km: number | null;
  duration_normal_minutes: number | null;
}

export interface VisualMapLayer extends BaseEntity {
  points: MapPoint[];
  route_legs: string[];
  route_lines?: RouteLine[];
  bounds?: MapBounds | null;
  display_notes?: string[];
}

export interface OutputTemplateMap extends BaseEntity {
  output_mode: 'customer_pdf' | 'website_page' | 'quotation' | 'whatsapp_summary' | 'internal_ops_sheet' | 'map_payload';
  required_sections: string[];
  data_dependencies: string[];
}
