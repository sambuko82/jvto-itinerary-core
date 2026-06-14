import type { PickupContext } from '../domain/itinerary.js';

export function buildPickupContexts(): PickupContext[] {
  return [
    {
      id: 'surabaya_airport_pickup',
      label: 'Surabaya Airport pickup',
      status: 'active',
      confidence: 'manual_seed',
      type: 'airport',
      location_group: 'Surabaya',
      default_ready_buffer_minutes: 45,
      required_customer_fields: ['flight_number', 'arrival_time', 'origin_city'],
      risk_factors: ['flight_delay', 'baggage_delay', 'airport_exit_congestion'],
      affects: ['actual_departure_time', 'first_day_route_feasibility', 'meal_stop_need', 'hotel_checkin_time'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/pickup-dropoff.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'surabaya_hotel_pickup',
      label: 'Surabaya hotel pickup',
      status: 'active',
      confidence: 'manual_seed',
      type: 'hotel',
      location_group: 'Surabaya',
      default_ready_buffer_minutes: 15,
      required_customer_fields: ['hotel_name', 'pickup_time'],
      risk_factors: ['late_checkout', 'luggage_loading', 'city_traffic'],
      affects: ['actual_departure_time', 'first_day_route_feasibility'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/pickup-dropoff.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'surabaya_train_station_pickup',
      label: 'Surabaya train station pickup',
      status: 'active',
      confidence: 'manual_seed',
      type: 'train_station',
      location_group: 'Surabaya',
      default_ready_buffer_minutes: 20,
      required_customer_fields: ['train_number', 'arrival_time', 'station_name'],
      risk_factors: ['train_delay', 'station_crowd', 'luggage_loading'],
      affects: ['actual_departure_time', 'first_day_route_feasibility'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/pickup-dropoff.yaml', confidence: 'manual_seed' }]
    }
  ];
}
