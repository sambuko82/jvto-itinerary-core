import { z } from 'zod';

const sourceTraceSchema = z.object({
  source: z.enum(['llm_wiki', 'jvto_web', 'new_backoffice', 'manual_seed', 'generated']),
  ref: z.string(),
  field: z.string().optional(),
  confidence: z.enum(['verified', 'inferred', 'manual_seed', 'needs_review']).optional()
});

const baseSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['active', 'draft', 'needs_review', 'deprecated']),
  confidence: z.enum(['verified', 'inferred', 'manual_seed', 'needs_review']),
  source_trace: z.array(sourceTraceSchema).min(1)
});

export const generatedEntitySchema = baseSchema.passthrough();
export const nonEmptyArraySchema = z.array(z.unknown()).min(1);

export const pickupContextSchema = baseSchema.extend({
  type: z.string(),
  location_group: z.string(),
  default_ready_buffer_minutes: z.number().int().nonnegative(),
  required_customer_fields: z.array(z.string()),
  risk_factors: z.array(z.string()),
  affects: z.array(z.string())
});

export const dropoffContextSchema = baseSchema.extend({
  type: z.string(),
  location_group: z.string(),
  default_buffer_minutes: z.number().int().nonnegative(),
  connects_to: z.array(z.string()).optional(),
  required_customer_fields: z.array(z.string()).optional(),
  cost_impacts: z.array(z.string()),
  risk_factors: z.array(z.string())
});

export const routeLegSchema = baseSchema.extend({
  from_location: z.string(),
  to_location: z.string(),
  distance_km: z.number().nullable().optional(),
  duration_text: z.string(),
  duration_normal_minutes: z.number().nullable().optional(),
  duration_busy_minutes: z.number().nullable().optional(),
  road_profiles: z.array(z.string()),
  risk_factors: z.array(z.string()),
  meal_stop_possible: z.boolean().optional(),
  night_drive_possible: z.boolean().optional(),
  recommended_departure_window: z.string().optional(),
  used_by_packages: z.array(z.string()).optional(),
  cost_impacts: z.array(z.string()).optional()
});

export const costComponentSchema = baseSchema.extend({
  category: z.string(),
  unit: z.string(),
  applies_when: z.array(z.string()),
  customer_visible: z.union([z.boolean(), z.literal('included_in_package')]),
  formula: z.string().optional(),
  default_rate_idr: z.number().nullable().optional(),
  channel_behavior: z.array(z.string()).optional()
});

export const manifestSchema = z.object({
  generated_at: z.string(),
  schema_version: z.number().int().positive(),
  source_mode: z.literal('manual_seed_mvp'),
  output_count: z.number().int().positive(),
  outputs: z.array(z.string()).min(20),
  warnings: z.array(z.string()).min(1),
  missing_data: z.array(z.string()).min(1),
  next_actions: z.array(z.string()).min(1),
  status: z.literal('mvp_seed_outputs_ready')
});

export const scenarioPreviewSchema = z.object({
  scenario: z.object({
    scenario_id: z.string(),
    pickup: z.object({
      type: z.string(),
      location: z.string(),
      time: z.string().optional()
    }),
    dropoff: z.object({
      type: z.string(),
      location: z.string()
    }),
    pax: z.number().int().positive(),
    duration_days: z.number().int().positive(),
    requested_destinations: z.array(z.string()).min(1)
  }).passthrough(),
  status: z.string(),
  normalized_pickup: z.object({
    context_id: z.string(),
    implications: z.array(z.string()).min(1)
  }).passthrough(),
  normalized_dropoff: z.object({
    context_id: z.string(),
    implications: z.array(z.string()).min(1)
  }).passthrough(),
  recommended_route_sequence: z.array(z.string()).min(2),
  route_leg_ids: z.array(z.string()).min(1),
  route_legs: z.array(z.object({
    id: z.string(),
    distance_km: z.null(),
    distance_status: z.literal('needs_verification'),
    polyline: z.null(),
    polyline_status: z.literal('needs_verification')
  }).passthrough()).min(1),
  operational_events: z.array(z.string()).min(1),
  meal_events: z.array(z.string()).min(1),
  accommodation_logic: z.array(z.string()).min(1),
  cost_components: z.array(z.object({
    id: z.string(),
    rate_idr: z.null(),
    status: z.literal('needs_verification')
  }).passthrough()).min(1),
  warnings: z.array(z.string()).min(1),
  better_route_notes: z.array(z.string()).min(1),
  output_targets: z.array(z.string()).min(5),
  missing_data: z.array(z.string()).min(1),
  source_mode: z.literal('manual_seed_mvp'),
  source_trace: z.array(sourceTraceSchema).min(1)
});

export const exportPayloadSchema = z.object({
  scenario_id: z.string(),
  source_mode: z.literal('manual_seed_mvp'),
  status: z.string(),
  generated_at: z.string(),
  pii_policy: z.literal('no_raw_customer_pii'),
  missing_data: z.array(z.string()).min(1),
  payload_type: z.enum(['website_page', 'customer_pdf', 'whatsapp_summary', 'internal_ops', 'ai_context_pack'])
}).passthrough();

export function validateArray<T>(name: string, schema: z.ZodType<T>, data: unknown): void {
  const result = z.array(schema).safeParse(data);
  if (!result.success) {
    throw new Error(`${name} validation failed: ${result.error.message}`);
  }
}

export function validateObject<T>(name: string, schema: z.ZodType<T>, data: unknown): void {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`${name} validation failed: ${result.error.message}`);
  }
}
