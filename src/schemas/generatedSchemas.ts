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

export function validateArray<T>(name: string, schema: z.ZodType<T>, data: unknown): void {
  const result = z.array(schema).safeParse(data);
  if (!result.success) {
    throw new Error(`${name} validation failed: ${result.error.message}`);
  }
}
