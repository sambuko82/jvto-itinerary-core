// ── Brain file types ──────────────────────────────────────────────────

export interface PickupContext {
  id: string
  label: string
  type: string
  location_group: string
}

export interface DropoffContext {
  id: string
  label: string
  type: string
  location_group: string
}

export interface Destination {
  id: number
  name: string
  slug?: string
  description?: string
  trail_details?: string
  tips_for_visitors?: string
  best_time_to_visit?: string
  main_attractions?: string
}

export interface Activity {
  id: string
  db_id: number | null
  destination_id: number
  destination_name: string
  name: string
  cost_idr: number
  quantity_formula: string
  cost_type: string
  is_default_jvto: boolean
  notes?: string
}

export interface OtherItem {
  id: number
  name: string
  code: string
  price_idr: number
  quantity_formula: string
  order_channel_id: number
  order_channel_name: string
  is_default_jvto: boolean
  notes?: string
}

export interface RoomType {
  id: number
  room_name: string
  bed_type: string
  rate_idr: number
  rate_twt_idr: number | null
}

export interface Hotel {
  id: number
  name: string
  destination_id: number
  destination_name: string
  address: string
  lunch_rate_idr: number | null
  dinner_rate_idr: number | null
  room_types: RoomType[]
}

export interface VehicleType {
  id: number
  name: string
  capacity_min_pax: number
  capacity_max_pax: number | null
  rate_jvto_per_day: number
}

export interface VehicleRuleEntry {
  vehicle_type_id: number
  vehicle_name: string
  vehicle_rate_per_day: number
  crew_role_id: number
  crew_role_name: string
  crew_rate_per_day: number
}

export interface VehicleRule {
  id: number | string
  order_channel_id: number
  pax: number
  vehicles: VehicleRuleEntry[]
  summary: string
}

export interface BrainData {
  destinations: Destination[]
  hotels: Hotel[]
  activities: Activity[]
  vehicleTypes: VehicleType[]
  vehicleRules: VehicleRule[]
  otherItems: OtherItem[]
  pickupContexts: PickupContext[]
  dropoffContexts: DropoffContext[]
}

// ── Form input types ──────────────────────────────────────────────────

export interface DayPickup {
  location: string
  time: string
}

export interface DayDropoff {
  location: string
  estimatedTime: string
}

export interface DayInput {
  dayNumber: number
  date: string
  pickup: DayPickup | null
  destinationIds: number[]
  hotelId: number | null
  roomTypeId: number | null
  roomCount: number
  meals: { breakfast: boolean; lunch: boolean; dinner: boolean }
  notes: string
  routeDescription: string
  dropoff: DayDropoff | null
}

export interface ItineraryInput {
  customer: { name: string; pax: number }
  origin: string
  days: DayInput[]
}

// ── Result types ──────────────────────────────────────────────────────

export interface ExpenseLine {
  label: string
  detail: string
  quantity: number
  unitCost: number
  total: number
}

export interface DayResult {
  dayNumber: number
  date: string
  pickup: DayPickup | null
  dropoff: DayDropoff | null
  destinationNames: string[]
  activityNames: string[]
  hotel: { hotelName: string; roomTypeName: string; roomCount: number } | null
  meals: string[]
  notes: string
  routeDescription: string
  expenseLines: ExpenseLine[]
  daySubtotal: number
}

export interface ItineraryResult {
  input: ItineraryInput
  vehicleType: VehicleType
  vehicleSummary: string
  days: DayResult[]
  vehicleDays: number
  vehicleLines: ExpenseLine[]
  vehicleCost: number
  crewLines: ExpenseLine[]
  crewCost: number
  otherLines: ExpenseLine[]
  otherTotal: number
  totalExpense: number
  sellingPrice: number
  sellingPricePerPax: number
}
