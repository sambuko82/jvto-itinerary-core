// Cancellation decision-matrix loader + schema.
//
// The matrix is a committed snapshot of llm-wiki's Policy Bundle Compiler v2.0
// output (input/llm-wiki/policy-bundle/decision-matrix.json). It is the single
// source of cancellation outcomes; evaluateCancellation reads refund
// percentages, the Recovery Fee, and Package Credit locks from here.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { INPUT_DIR } from '../config/paths.js';

const ruleSchema = z
  .object({
    outcome: z.string().optional(),
    cash_refund_percent: z.number().optional(),
    package_credit_eligible: z.boolean().optional(),
    recovery_fee_percent: z.number().optional(),
    maximum_uses: z.number().optional(),
    options: z.array(z.string()).optional(),
    first_remedy: z.string().optional(),
    second_remedy: z.string().optional()
  })
  .passthrough();

export const decisionMatrixSchema = z
  .object({
    schema_version: z.string(),
    policy_version: z.string(),
    effective_from: z.string(),
    cutoff_hours: z.number(),
    cutoff_comparison: z.string().default('inclusive'),
    rules: z.object({
      full_voluntary_gte_48h: ruleSchema,
      full_voluntary_lt_48h: ruleSchema,
      partial_gte_48h: ruleSchema,
      partial_lt_48h: ruleSchema,
      partial_after_day_1: ruleSchema,
      no_show: ruleSchema,
      flight_disruption_verified: ruleSchema,
      flight_disruption_unverified: ruleSchema,
      force_majeure_full_tour: ruleSchema,
      force_majeure_partial_tour: ruleSchema,
      jvto_operational: ruleSchema
    }),
    partial_thresholds: z.object({
      minimum_remaining_pax: z.number(),
      minimum_remaining_percent: z.number(),
      threshold_fail_behaviour: z.string().default('reclassify_as_full_cancellation'),
      foc_passenger_refund_percent: z.number().default(0)
    }),
    package_credit_locks: z.object({
      expires: z.boolean(),
      cash_value: z.boolean(),
      package_change_allowed: z.boolean(),
      split_allowed: z.boolean(),
      transfer_allowed: z.boolean(),
      maximum_transfers: z.number(),
      original_package_locked: z.boolean(),
      original_pax_locked: z.boolean(),
      original_price_locked: z.boolean()
    }),
    booking_scope: z
      .object({
        allowed_sources: z.array(z.string())
      })
      .passthrough()
  })
  .passthrough();

export type DecisionMatrix = z.infer<typeof decisionMatrixSchema>;

const DEFAULT_MATRIX_PATH = resolve(INPUT_DIR, 'llm-wiki/policy-bundle/decision-matrix.json');

/**
 * Load + validate the cancellation decision matrix snapshot. Throws (via zod)
 * if the snapshot is malformed so a bad policy sync fails loudly.
 */
export function loadDecisionMatrix(path: string = DEFAULT_MATRIX_PATH): DecisionMatrix {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return decisionMatrixSchema.parse(raw);
}
