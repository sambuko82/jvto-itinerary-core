import { z } from 'zod';

/**
 * Schema for the new-backoffice `ExportDataItineraryCore::bundle()` response.
 *
 * Mirrors the real PHP controller shape (schema_version
 * `backoffice-itinerary-core/v1`) at:
 *   jvto-devteam/new-backoffice
 *   app/Http/Controllers/ExportData/ExportDataItineraryCore.php
 *
 * Row objects use `.passthrough()` so additional backoffice columns do not break
 * ingestion; only the fields this core consumes are validated.
 * Numeric DB columns are coerced because some arrive as strings.
 */

const num = z.coerce.number();
const intNum = z.coerce.number().int();

const packageSchema = z
  .object({
    id: intNum,
    code: z.string().nullable().optional(),
    slug: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    duration_id: intNum.nullable().optional(),
    order_channel_id: intNum.nullable().optional(),
    package_category_id: intNum.nullable().optional(),
    start_destination_id: intNum.nullable().optional(),
    end_destination_id: intNum.nullable().optional(),
    ideal_arrival: z.string().nullable().optional(),
    physicality: z.string().nullable().optional(),
    suitable_for: z.string().nullable().optional(),
    is_publish: z.boolean().optional(),
    total_breakfast: intNum.optional(),
    total_lunch: intNum.optional(),
    total_dinner: intNum.optional()
  })
  .passthrough();

const packagePriceSchema = z
  .object({
    id: intNum,
    package_id: intNum,
    price_tier_id: intNum.nullable().optional(),
    price: intNum.optional(),
    klook_retail_price: intNum.optional(),
    klook_net_price: intNum.optional()
  })
  .passthrough();

const packageItineraryDaySchema = z
  .object({
    id: intNum,
    package_id: intNum,
    day_no: intNum,
    activity_start_id: intNum.nullable().optional(),
    activity_end_id: intNum.nullable().optional(),
    title: z.string().nullable().optional(),
    activity: z.string().nullable().optional(),
    hotel_id: intNum.nullable().optional(),
    meal_breakfast: z.boolean().optional(),
    meal_lunch: z.boolean().optional(),
    meal_dinner: z.boolean().optional()
  })
  .passthrough();

const packageItineraryDayDetailSchema = z
  .object({
    id: intNum,
    itinerary_day_id: intNum,
    sort_order: intNum.nullable().optional(),
    time: z.string().nullable().optional(),
    activity_id: intNum.nullable().optional(),
    notes: z.string().nullable().optional()
  })
  .passthrough();

const packageDestinationSchema = z
  .object({
    id: intNum,
    package_id: intNum,
    destination_id: intNum
  })
  .passthrough();

const packageHotelOptionSchema = z
  .object({
    id: intNum,
    package_id: intNum,
    day_no: intNum,
    hotel_id: intNum.nullable().optional()
  })
  .passthrough();

const hotelSchema = z
  .object({
    id: intNum,
    name: z.string().nullable().optional(),
    destination_id: intNum.nullable().optional(),
    address: z.string().nullable().optional(),
    map_url: z.string().nullable().optional(),
    lunch_rate: intNum.optional(),
    dinner_rate: intNum.optional()
  })
  .passthrough();

const roomTypeSchema = z
  .object({
    id: intNum,
    hotel_id: intNum,
    room_name: z.string().nullable().optional(),
    bed_type: z.string().nullable().optional(),
    rate_idr: intNum.optional(),
    rate_twt_idr: intNum.optional()
  })
  .passthrough();

const roomConfigurationSchema = z
  .object({
    id: intNum,
    hotel_id: intNum,
    room_type_id: intNum,
    pax: num.nullable().optional(),
    quantity: num.nullable().optional()
  })
  .passthrough();

const vehicleTypeSchema = z
  .object({
    id: intNum,
    name: z.string().nullable().optional(),
    capacity_min_pax: num.nullable().optional(),
    capacity_max_pax: num.nullable().optional(),
    price_per_day: intNum.optional(),
    price_twt_per_day: intNum.optional()
  })
  .passthrough();

const crewRoleSchema = z
  .object({
    id: intNum,
    name: z.string().nullable().optional(),
    rate_per_day: intNum.optional(),
    rate_twt_per_day: intNum.optional(),
    order_channel_id: intNum.nullable().optional()
  })
  .passthrough();

const transportCrewRuleSchema = z
  .object({
    id: intNum,
    pax: num,
    // vehicle_type_id falls back to a name string when unmapped in PHP.
    vehicle_type_id: z.union([intNum, z.string()]).nullable().optional(),
    crew_role_id: intNum.nullable().optional(),
    order_channel_id: intNum.nullable().optional()
  })
  .passthrough();

const destinationActivitySchema = z
  .object({
    id: intNum,
    code: z.string().nullable().optional(),
    destination_id: intNum.nullable().optional(),
    vendor_id: intNum.nullable().optional(),
    name: z.string().nullable().optional(),
    unit: z.string().nullable().optional(),
    formula: z.string().nullable().optional(),
    price: intNum.optional(),
    is_default_jvto: z.boolean().optional(),
    is_default_klook: z.boolean().optional(),
    is_default_twt: z.boolean().optional()
  })
  .passthrough();

const otherActivitySchema = z
  .object({
    id: intNum,
    code: z.string().nullable().optional(),
    vendor_id: intNum.nullable().optional(),
    name: z.string().nullable().optional(),
    unit: z.string().nullable().optional(),
    formula: z.string().nullable().optional(),
    price: intNum.optional(),
    is_default_jvto: z.boolean().optional()
  })
  .passthrough();

const bookingLogisticsPatternSchema = z
  .object({
    pattern_id: z.string(),
    pickup_location_group: z.string(),
    dropoff_location_group: z.string(),
    typical_pickup_time_bucket: z.string(),
    destinations: z.array(z.string()).default([]),
    package_ids: z.array(intNum).default([]),
    sample_count: intNum.default(0),
    risk_notes: z.array(z.string()).default([])
  })
  .passthrough();

const bookingFinancePatternSchema = z
  .object({
    package_id: intNum.nullable(),
    sample_count: intNum.default(0),
    avg_total_expense: intNum.default(0),
    avg_total_expense_crew: intNum.default(0),
    avg_profit: intNum.default(0)
  })
  .passthrough();

const activityCostPatternSchema = z
  .object({
    activity_id: intNum.nullable(),
    sample_count: intNum.default(0),
    avg_qty: num.default(0),
    avg_price: intNum.default(0),
    avg_subtotal: intNum.default(0)
  })
  .passthrough();

const actualCostPatternsSchema = z
  .object({
    destination_activities: z.array(activityCostPatternSchema).default([]),
    other_activities: z.array(activityCostPatternSchema).default([])
  })
  .passthrough();

export const backofficeBundleSchema = z
  .object({
    schema_version: z.literal('backoffice-itinerary-core/v1'),
    generated_at: z.string().optional(),
    pii_policy: z.string().optional(),
    source: z.string().optional(),

    packages: z.array(packageSchema).default([]),
    package_prices: z.array(packagePriceSchema).default([]),
    package_itinerary_days: z.array(packageItineraryDaySchema).default([]),
    package_itinerary_day_details: z.array(packageItineraryDayDetailSchema).default([]),
    package_destinations: z.array(packageDestinationSchema).default([]),
    package_hotel_options: z.array(packageHotelOptionSchema).default([]),
    hotels: z.array(hotelSchema).default([]),
    room_types: z.array(roomTypeSchema).default([]),
    room_configurations: z.array(roomConfigurationSchema).default([]),
    vehicle_types: z.array(vehicleTypeSchema).default([]),
    crew_roles: z.array(crewRoleSchema).default([]),
    transport_crew_rules: z.array(transportCrewRuleSchema).default([]),
    destination_activities: z.array(destinationActivitySchema).default([]),
    other_activities: z.array(otherActivitySchema).default([]),

    booking_logistics_patterns: z.array(bookingLogisticsPatternSchema).default([]),
    booking_finance_patterns: z.array(bookingFinancePatternSchema).default([]),
    actual_cost_patterns: actualCostPatternsSchema.default({ destination_activities: [], other_activities: [] }),

    warnings: z.array(z.string()).default([])
  })
  .passthrough();

export type BackofficeBundle = z.infer<typeof backofficeBundleSchema>;
export type BackofficeHotel = z.infer<typeof hotelSchema>;
export type BackofficeRoomType = z.infer<typeof roomTypeSchema>;
export type BackofficeRoomConfiguration = z.infer<typeof roomConfigurationSchema>;
export type BackofficeVehicleType = z.infer<typeof vehicleTypeSchema>;
export type BackofficeCrewRole = z.infer<typeof crewRoleSchema>;
export type BackofficeTransportCrewRule = z.infer<typeof transportCrewRuleSchema>;
export type BackofficeDestinationActivity = z.infer<typeof destinationActivitySchema>;
export type BackofficeOtherActivity = z.infer<typeof otherActivitySchema>;
export type BackofficeLogisticsPattern = z.infer<typeof bookingLogisticsPatternSchema>;
export type BackofficeFinancePattern = z.infer<typeof bookingFinancePatternSchema>;
export type BackofficeActivityCostPattern = z.infer<typeof activityCostPatternSchema>;
