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
  // jvto-web destination registry, 'verified_tomtom' when sourced from the
  // TomTom Search/Geocoding API, else an explicit gap marker.
  geo_status: 'verified_jvto_web' | 'verified_tomtom' | 'needs_verified_geocode';
  geo_source: string | null;
  /** TomTom Search API place ID (search:ta:* format) — present when geo_status is 'verified_tomtom'. */
  tomtom_place_id?: string;
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
  // 'tomtom_routed_polyline' is road-routed geometry from the TomTom Routing API.
  geometry_type: 'great_circle_placeholder' | 'tomtom_routed_polyline' | null;
  // false when geometry_type is 'tomtom_routed_polyline' (TomTom routes ARE road geometry).
  not_road_geometry: boolean;
  geometry_status: 'placeholder_from_verified_endpoints' | 'tomtom_routed_polyline' | 'needs_endpoint_coordinates';
  coordinates: [number, number][] | null;
  distance_km: number | null;
  duration_normal_minutes: number | null;
  /** Raw TomTom routing response values — present when geometry_type is 'tomtom_routed_polyline'. */
  tomtom_length_m?: number;
  tomtom_travel_time_s?: number;
}

export interface VisualMapLayer extends BaseEntity {
  points: MapPoint[];
  route_legs: string[];
  route_lines?: RouteLine[];
  bounds?: MapBounds | null;
  display_notes?: string[];
  dynamic_render_config?: DynamicRenderConfig | null;
}

/** TomTom-verified coordinate entry for an operational route node. */
export interface TomTomNodeEntry {
  node_id: string;
  label: string;
  lat: number;
  lng: number;
  /** TomTom Search API place ID (search:ta:* format); null for geography-type results. */
  tomtom_place_id: string | null;
  /** TomTom POI/geography category (e.g. PUBLIC_AIRPORT, FERRY_TERMINAL, MUNICIPALITY). */
  tomtom_category: string | null;
  /** Preferred routing entry point coordinate (e.g. access point for airports/harbors). */
  entry_point: { lat: number; lng: number } | null;
  /** 'verified_tomtom_api' when confirmed via live TomTom API call; 'seed_approximation' otherwise. */
  confidence: 'verified_tomtom_api' | 'seed_approximation';
  /** API used to verify the coordinate. */
  geo_source: 'tomtom_poi' | 'tomtom_geocode' | 'seed';
  verified_at: string;
  /** Alternative node_ids that resolve to this entry (e.g. 'bondowoso_ijen_area' → bondowoso). */
  node_id_aliases?: string[];
}

/** Road-routed leg from the TomTom Routing API with decoded polyline. */
export interface TomTomRoutedLeg {
  leg_id: string;
  from_node_id: string;
  to_node_id: string;
  distance_km_tomtom: number;
  duration_normal_minutes_tomtom: number;
  duration_busy_minutes_tomtom: number | null;
  geometry_type: 'tomtom_routed_polyline';
  /** [lat, lng] pairs — matches existing coordinate axis convention in route_lines. */
  coordinates: [number, number][];
  routing_source: 'tomtom_routing_api_v1';
  traffic_model: 'live' | 'historical_speed';
  routed_at: string;
}

/** Rendering payload for TomTom Maps Web SDK clients. */
export interface DynamicRenderConfig {
  sdk: 'tomtom-web-sdk-v6';
  /** Name of the env var holding the TomTom API key — never the key itself. */
  api_key_env: 'TOMTOM_API_KEY';
  map_style: 'tomtom://vector/1/basic-main';
  /** Map center as [longitude, latitude] — TomTom SDK convention. */
  center: [number, number];
  zoom: number;
  traffic_flow: boolean;
  traffic_incidents: boolean;
  marker_layer_ids: string[];
  route_layer_ids: string[];
}

/** Compiled TomTom geotag index: node coordinates + road polylines + render config. */
export interface TomTomGeotagIndex extends BaseEntity {
  nodes: TomTomNodeEntry[];
  routed_legs: TomTomRoutedLeg[];
  fill_status: 'seed_only' | 'routing_filled';
  fill_generated_at: string | null;
}

export interface OutputTemplateMap extends BaseEntity {
  output_mode: 'customer_pdf' | 'website_page' | 'quotation' | 'whatsapp_summary' | 'internal_ops_sheet' | 'map_payload';
  required_sections: string[];
  data_dependencies: string[];
}
