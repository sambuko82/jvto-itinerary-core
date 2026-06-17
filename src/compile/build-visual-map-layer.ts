import type { MapPoint, RouteLine, MapBounds, VisualMapLayer } from '../domain/output.js';
import { resolveDestinationToken } from '../config/destination-crosswalk.js';
import { buildRouteLegIndex } from './build-route-leg-index.js';
import { lookupCoordinate, type CoordinateIndex } from './build-location-coordinate-index.js';

/** Ordered markers for the sample corridor, by stable location_ref. */
const POINT_SEEDS: Array<Pick<MapPoint, 'type' | 'label' | 'location_ref'>> = [
  { type: 'pickup', label: 'Surabaya Airport', location_ref: 'surabaya_airport' },
  { type: 'destination', label: 'Mount Bromo', location_ref: 'bromo' },
  { type: 'destination', label: 'Madakaripura Waterfall', location_ref: 'madakaripura' },
  { type: 'hotel_area', label: 'Bondowoso / Ijen Area', location_ref: 'bondowoso_ijen_area' },
  { type: 'destination', label: 'Ijen Crater', location_ref: 'ijen' },
  { type: 'dropoff', label: 'Ketapang Harbor', location_ref: 'ketapang_harbor' }
];

/** Each route leg's endpoints, expressed as marker location_refs (handles the
 * Madakaripura side-trip: the Bondowoso leg starts from Bromo, not Madakaripura). */
const LEG_ENDPOINTS: Array<{ leg_id: string; from_ref: string; to_ref: string }> = [
  { leg_id: 'surabaya_airport_to_bromo_area', from_ref: 'surabaya_airport', to_ref: 'bromo' },
  { leg_id: 'bromo_area_to_madakaripura', from_ref: 'bromo', to_ref: 'madakaripura' },
  { leg_id: 'bromo_area_to_bondowoso_ijen_area', from_ref: 'bromo', to_ref: 'bondowoso_ijen_area' },
  { leg_id: 'bondowoso_ijen_area_to_ijen_crater', from_ref: 'bondowoso_ijen_area', to_ref: 'ijen' },
  { leg_id: 'ijen_area_to_ketapang_harbor', from_ref: 'ijen', to_ref: 'ketapang_harbor' }
];

function resolvePoint(seed: (typeof POINT_SEEDS)[number], coords: CoordinateIndex): MapPoint {
  const entry = lookupCoordinate(coords, resolveDestinationToken(seed.location_ref ?? ''));
  if (entry) {
    return { ...seed, lat: entry.lat, lng: entry.lng, geo_status: 'verified_jvto_web', geo_source: entry.source };
  }
  return { ...seed, lat: null, lng: null, geo_status: 'needs_verified_geocode', geo_source: null };
}

function buildRouteLines(coords: CoordinateIndex): RouteLine[] {
  const legs = new Map(buildRouteLegIndex().map((l) => [l.id, l]));
  return LEG_ENDPOINTS.map(({ leg_id, from_ref, to_ref }) => {
    const leg = legs.get(leg_id);
    const from = lookupCoordinate(coords, resolveDestinationToken(from_ref));
    const to = lookupCoordinate(coords, resolveDestinationToken(to_ref));
    const both = from && to;
    return {
      leg_id,
      geometry_type: both ? 'great_circle_placeholder' : null,
      not_road_geometry: true,
      geometry_status: both ? 'placeholder_from_verified_endpoints' : 'needs_endpoint_coordinates',
      coordinates: both ? [[from.lat, from.lng], [to.lat, to.lng]] : null,
      distance_km: leg?.distance_km ?? null,
      duration_normal_minutes: leg?.duration_normal_minutes ?? null
    };
  });
}

function computeBounds(points: MapPoint[]): MapBounds | null {
  const located = points.filter((p): p is MapPoint & { lat: number; lng: number } => p.lat != null && p.lng != null);
  if (located.length === 0) return null;
  const lats = located.map((p) => p.lat);
  const lngs = located.map((p) => p.lng);
  return { south: Math.min(...lats), west: Math.min(...lngs), north: Math.max(...lats), east: Math.max(...lngs) };
}

export function buildVisualMapLayer(coords: CoordinateIndex): VisualMapLayer[] {
  const points = POINT_SEEDS.map((seed) => resolvePoint(seed, coords));
  const route_lines = buildRouteLines(coords);
  const verifiedCount = points.filter((p) => p.geo_status === 'verified_jvto_web').length;

  return [
    {
      id: 'map_surabaya_bromo_ijen_ketapang',
      label: 'Surabaya to Bromo, Ijen, Ketapang map layer',
      status: 'active',
      confidence: 'manual_seed',
      points,
      route_legs: LEG_ENDPOINTS.map((l) => l.leg_id),
      route_lines,
      bounds: computeBounds(points),
      display_notes: [
        `${verifiedCount}/${points.length} markers carry verified jvto-web coordinates; the rest need a verified transit-node geocode.`,
        'route_lines are great-circle placeholders between verified endpoints, NOT road geometry — replace with a routed polyline (Mapbox/OSRM) when available.',
        'Distance/duration labels come from the researched route-leg index (04).'
      ],
      source_trace: [
        { source: 'manual_seed', ref: 'seed/manual-overrides/visual-map-layer.yaml', confidence: 'manual_seed' },
        {
          source: 'jvto_web',
          ref: 'src/lib/publicContent/generated/destinationDetailSnapshots.json',
          field: 'latitude,longitude',
          confidence: 'verified'
        }
      ]
    }
  ];
}
