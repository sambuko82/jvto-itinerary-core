import type {
  MapPoint,
  RouteLine,
  MapBounds,
  VisualMapLayer,
  DynamicRenderConfig,
  TomTomGeotagIndex,
  TomTomRoutedLeg
} from '../domain/output.js';
import { resolveDestinationToken } from '../config/destination-crosswalk.js';
import { buildRouteLegIndex } from './build-route-leg-index.js';
import {
  lookupCoordinate,
  lookupTomTomNode,
  type CoordinateIndex,
  type TomTomNodeIndex
} from './build-location-coordinate-index.js';

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

/** Resolve a coordinate for a location_ref: jvto_web first, TomTom fallback. */
function resolveCoord(
  ref: string,
  coords: CoordinateIndex,
  tomtomIndex: TomTomNodeIndex | null
): { lat: number; lng: number } | null {
  const entry = lookupCoordinate(coords, resolveDestinationToken(ref));
  if (entry) return { lat: entry.lat, lng: entry.lng };
  if (tomtomIndex) {
    const tNode = lookupTomTomNode(tomtomIndex, ref);
    if (tNode) {
      return tNode.entry_point ?? { lat: tNode.lat, lng: tNode.lng };
    }
  }
  return null;
}

function resolvePoint(
  seed: (typeof POINT_SEEDS)[number],
  coords: CoordinateIndex,
  tomtomIndex: TomTomNodeIndex | null
): MapPoint {
  // 1. Try jvto_web (authoritative for destination registry nodes)
  const entry = lookupCoordinate(coords, resolveDestinationToken(seed.location_ref ?? ''));
  if (entry) {
    return { ...seed, lat: entry.lat, lng: entry.lng, geo_status: 'verified_jvto_web', geo_source: entry.source };
  }

  // 2. TomTom fallback for transit nodes (airport, harbor, staging town)
  if (tomtomIndex && seed.location_ref) {
    const tNode = lookupTomTomNode(tomtomIndex, seed.location_ref);
    if (tNode) {
      return {
        ...seed,
        lat: tNode.lat,
        lng: tNode.lng,
        geo_status: 'verified_tomtom',
        geo_source: 'tomtom',
        ...(tNode.tomtom_place_id ? { tomtom_place_id: tNode.tomtom_place_id } : {})
      };
    }
  }

  return { ...seed, lat: null, lng: null, geo_status: 'needs_verified_geocode', geo_source: null };
}

function buildRouteLines(
  coords: CoordinateIndex,
  tomtomIndex: TomTomNodeIndex | null,
  routedLegs: Map<string, TomTomRoutedLeg>
): RouteLine[] {
  const legs = new Map(buildRouteLegIndex().map((l) => [l.id, l]));
  return LEG_ENDPOINTS.map(({ leg_id, from_ref, to_ref }) => {
    const leg = legs.get(leg_id);

    // Prefer TomTom road-routed polyline when available
    const routedLeg = routedLegs.get(leg_id);
    if (routedLeg) {
      return {
        leg_id,
        geometry_type: 'tomtom_routed_polyline' as const,
        not_road_geometry: false,
        geometry_status: 'tomtom_routed_polyline' as const,
        coordinates: routedLeg.coordinates,
        distance_km: routedLeg.distance_km_tomtom,
        duration_normal_minutes: routedLeg.duration_normal_minutes_tomtom,
        tomtom_length_m: Math.round(routedLeg.distance_km_tomtom * 1000),
        tomtom_travel_time_s: routedLeg.duration_normal_minutes_tomtom * 60
      };
    }

    // Fall back to great-circle placeholder (or null when an endpoint lacks coords)
    const from = resolveCoord(from_ref, coords, tomtomIndex);
    const to = resolveCoord(to_ref, coords, tomtomIndex);
    const both = from && to;
    return {
      leg_id,
      geometry_type: both ? 'great_circle_placeholder' as const : null,
      not_road_geometry: true,
      geometry_status: both
        ? 'placeholder_from_verified_endpoints' as const
        : 'needs_endpoint_coordinates' as const,
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

export function buildVisualMapLayer(
  coords: CoordinateIndex,
  tomtomData?: { nodeIndex: TomTomNodeIndex; geotagIndex: TomTomGeotagIndex } | null
): VisualMapLayer[] {
  const tomtomIndex = tomtomData?.nodeIndex ?? null;
  const routedLegs = new Map<string, TomTomRoutedLeg>(
    (tomtomData?.geotagIndex.routed_legs ?? []).map((l) => [l.leg_id, l])
  );

  const points = POINT_SEEDS.map((seed) => resolvePoint(seed, coords, tomtomIndex));
  const route_lines = buildRouteLines(coords, tomtomIndex, routedLegs);

  const jvtoWebCount = points.filter((p) => p.geo_status === 'verified_jvto_web').length;
  const tomtomCount = points.filter((p) => p.geo_status === 'verified_tomtom').length;
  const verifiedCount = jvtoWebCount + tomtomCount;

  const bounds = computeBounds(points);

  const dynamic_render_config: DynamicRenderConfig | null = tomtomData
    ? {
        sdk: 'tomtom-web-sdk-v6',
        api_key_env: 'TOMTOM_API_KEY',
        map_style: 'tomtom://vector/1/basic-main',
        center: bounds
          ? [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2]
          : [113.5, -8.0],
        zoom: 8,
        traffic_flow: true,
        traffic_incidents: true,
        marker_layer_ids: POINT_SEEDS.map((s) => s.location_ref).filter((r): r is string => r != null),
        route_layer_ids: LEG_ENDPOINTS.map((l) => l.leg_id)
      }
    : null;

  const coordNote =
    tomtomCount > 0
      ? `${jvtoWebCount}/${points.length} markers carry verified jvto-web coordinates; ${tomtomCount} carry TomTom-verified coordinates; the rest need a verified geocode.`
      : `${verifiedCount}/${points.length} markers carry verified jvto-web coordinates; the rest need a verified transit-node geocode.`;

  const routedCount = route_lines.filter((l) => l.geometry_type === 'tomtom_routed_polyline').length;
  const routeNote =
    routedCount > 0
      ? `${routedCount}/${route_lines.length} route_lines carry TomTom road geometry; remaining are great-circle placeholders or lack endpoint coordinates.`
      : 'route_lines are great-circle placeholders between verified endpoints, NOT road geometry — replace with a routed polyline (Mapbox/OSRM/TomTom) when available.';

  return [
    {
      id: 'map_surabaya_bromo_ijen_ketapang',
      label: 'Surabaya to Bromo, Ijen, Ketapang map layer',
      status: 'active',
      confidence: 'manual_seed',
      points,
      route_legs: LEG_ENDPOINTS.map((l) => l.leg_id),
      route_lines,
      bounds,
      display_notes: [
        coordNote,
        routeNote,
        'Distance/duration labels come from the researched route-leg index (04).'
      ],
      ...(dynamic_render_config ? { dynamic_render_config } : {}),
      source_trace: [
        { source: 'manual_seed', ref: 'seed/manual-overrides/visual-map-layer.yaml', confidence: 'manual_seed' },
        {
          source: 'jvto_web',
          ref: 'src/lib/publicContent/generated/destinationDetailSnapshots.json',
          field: 'latitude,longitude',
          confidence: 'verified'
        },
        ...(tomtomData
          ? [
              {
                source: 'tomtom' as const,
                ref: 'scripts/tomtom-verified-nodes.json',
                field: 'lat,lng',
                confidence: 'verified' as const
              }
            ]
          : [])
      ]
    }
  ];
}
