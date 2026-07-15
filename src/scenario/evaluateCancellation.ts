// Pure cancellation decision engine.
//
// evaluateCancellation() is a deterministic, side-effect-free function: given a
// booking + a cancellation request + the compiled decision matrix, it returns
// the outcome (refund / Package Credit / recovery / forfeit) with the rule id
// and policy version. It never touches a database, a payment gateway, or a
// clock — timing is derived from the ISO timestamps on the input.
//
// This is the "brain" the transactional backend (Laravel) and the website must
// consume; they must NOT recompute outcomes independently. Numbers come from the
// decision matrix (llm-wiki SSOT), never hard-coded here.
import { z } from 'zod';
import type { DecisionMatrix } from './cancellationPolicy.js';

export type RequestType =
  | 'full_cancellation'
  | 'partial_cancellation'
  | 'flight_disruption'
  | 'destination_disruption'
  | 'jvto_operational';

export type Cause =
  | 'voluntary'
  | 'destination_force_majeure'
  | 'transport_force_majeure'
  | 'jvto_operational'
  | 'no_show';

export interface CancellationBooking {
  dayOneStartAt: string; // ISO 8601
  originalPax: number;
  confirmedTotalPrice: number;
  confirmedPerPersonPrice: number;
  focPax?: number; // free-of-charge pax carry no refundable value
  bookingSource?: string; // must resolve to an allowed source (website)
  policyVersion?: string | null;
}

export interface CancellationPriorState {
  activeRequestExists?: boolean;
  alreadyRefunded?: boolean;
  creditAlreadyIssued?: boolean;
  recoveryUsed?: boolean;
}

export interface CancellationInput {
  booking: CancellationBooking;
  requestType: RequestType;
  cause: Cause;
  submittedAt: string; // ISO 8601
  cancelledPax?: number; // partial cancellation
  cancelledFocPax?: number; // how many of the cancelled pax are FOC
  verifiedEvent?: boolean; // force-majeure / flight evidence verified
  eventScope?: 'full_tour' | 'partial_tour';
  flightArrived?: boolean; // delayed-but-arrived path
  tourStarted?: boolean; // explicit override; otherwise derived from timestamps
  priorState?: CancellationPriorState;
}

export type Eligibility = 'eligible' | 'blocked' | 'manual_review' | 'options';

export interface CancellationDecision {
  outcome: string;
  eligibility: Eligibility;
  refundPercent: number;
  refundAmount: number;
  packageCreditEligible: boolean;
  recoveryFee: number;
  evidenceRequired: boolean;
  approvalRequired: boolean;
  ruleId: string;
  policyVersion: string | null;
  options: string[];
  warnings: string[];
}

// Runtime validation schema for untrusted callers (e.g. the HTTP endpoint).
// Enforces the requestType/cause enums so a typo cannot fall through to a
// financial branch. The engine itself stays pure and trusts its typed input.
export const cancellationInputSchema = z.object({
  booking: z.object({
    dayOneStartAt: z.string(),
    originalPax: z.number(),
    confirmedTotalPrice: z.number(),
    confirmedPerPersonPrice: z.number(),
    focPax: z.number().optional(),
    bookingSource: z.string().optional(),
    policyVersion: z.string().nullable().optional()
  }),
  requestType: z.enum([
    'full_cancellation',
    'partial_cancellation',
    'flight_disruption',
    'destination_disruption',
    'jvto_operational'
  ]),
  cause: z.enum([
    'voluntary',
    'destination_force_majeure',
    'transport_force_majeure',
    'jvto_operational',
    'no_show'
  ]),
  submittedAt: z.string(),
  cancelledPax: z.number().optional(),
  cancelledFocPax: z.number().optional(),
  verifiedEvent: z.boolean().optional(),
  eventScope: z.enum(['full_tour', 'partial_tour']).optional(),
  flightArrived: z.boolean().optional(),
  tourStarted: z.boolean().optional(),
  priorState: z
    .object({
      activeRequestExists: z.boolean().optional(),
      alreadyRefunded: z.boolean().optional(),
      creditAlreadyIssued: z.boolean().optional(),
      recoveryUsed: z.boolean().optional()
    })
    .optional()
});

function baseDecision(matrix: DecisionMatrix, input: CancellationInput, warnings: string[]): CancellationDecision {
  return {
    outcome: '',
    eligibility: 'eligible',
    refundPercent: 0,
    refundAmount: 0,
    packageCreditEligible: false,
    recoveryFee: 0,
    evidenceRequired: false,
    approvalRequired: false,
    ruleId: '',
    policyVersion: input.booking.policyVersion ?? matrix.policy_version,
    options: [],
    warnings
  };
}

export function evaluateCancellation(input: CancellationInput, matrix: DecisionMatrix): CancellationDecision {
  const warnings: string[] = [];
  const base = baseDecision(matrix, input, warnings);

  // ── 1. booking source must be an explicit, allowed (website) source ──
  // A missing source is NOT assumed to be website: the caller must pass the
  // booking's real recorded source, otherwise a WhatsApp/manual/OTA booking
  // could slip past this guard and receive Package Credit or a refund.
  const source = input.booking.bookingSource?.toLowerCase();
  if (!source || !matrix.booking_scope.allowed_sources.includes(source)) {
    return { ...base, outcome: 'rejected_non_website_booking', eligibility: 'blocked', ruleId: 'booking_source_invalid' };
  }

  // ── 2. idempotency guards (no duplicate financial action) ──
  const ps = input.priorState ?? {};
  if (ps.activeRequestExists) {
    return { ...base, outcome: 'duplicate_request', eligibility: 'blocked', ruleId: 'idempotency_active_request' };
  }
  if (ps.alreadyRefunded) {
    return { ...base, outcome: 'already_refunded', eligibility: 'blocked', ruleId: 'idempotency_refunded' };
  }
  if (ps.creditAlreadyIssued) {
    // Once the booking is converted to Package Credit it no longer exists to
    // cancel again — block ANY new financial cancellation decision (full OR
    // partial), not just full cancellation.
    return { ...base, outcome: 'credit_already_issued', eligibility: 'blocked', ruleId: 'idempotency_credit_issued' };
  }
  if (ps.recoveryUsed && input.requestType === 'flight_disruption') {
    return { ...base, outcome: 'recovery_already_used', eligibility: 'blocked', ruleId: 'idempotency_recovery_used' };
  }

  // ── 3. timing ──
  const dayOne = Date.parse(input.booking.dayOneStartAt);
  const submitted = Date.parse(input.submittedAt);
  const hoursBefore = (dayOne - submitted) / 3_600_000;
  const tourStarted = input.tourStarted ?? (Number.isFinite(hoursBefore) ? hoursBefore <= 0 : false);
  const beforeCutoff = Number.isFinite(hoursBefore) && hoursBefore >= matrix.cutoff_hours; // inclusive

  const perPerson = input.booking.confirmedPerPersonPrice;
  const total = input.booking.confirmedTotalPrice;
  const rules = matrix.rules;

  // ── 4. no-show / tour already started (voluntary) → forfeit ──
  if (input.cause === 'no_show' || (tourStarted && input.cause === 'voluntary')) {
    return {
      ...base,
      outcome: 'forfeited',
      eligibility: 'eligible',
      ruleId: input.cause === 'no_show' ? 'no_show' : 'tour_started_no_refund'
    };
  }

  // ── 5. destination force majeure ──
  if (input.cause === 'destination_force_majeure' || input.requestType === 'destination_disruption') {
    if (!input.verifiedEvent) {
      return {
        ...base,
        outcome: 'blocked_unverified_force_majeure',
        eligibility: 'blocked',
        evidenceRequired: true,
        ruleId: 'force_majeure_unverified'
      };
    }
    if ((input.eventScope ?? 'full_tour') === 'full_tour') {
      return {
        ...base,
        outcome: 'force_majeure_options',
        eligibility: 'options',
        options: rules.force_majeure_full_tour.options ?? [],
        packageCreditEligible: true,
        evidenceRequired: true,
        approvalRequired: true,
        ruleId: 'force_majeure_full_tour'
      };
    }
    return {
      ...base,
      outcome: 'force_majeure_partial_options',
      eligibility: 'options',
      options: [rules.force_majeure_partial_tour.first_remedy, rules.force_majeure_partial_tour.second_remedy].filter(
        (x): x is string => Boolean(x)
      ),
      evidenceRequired: true,
      approvalRequired: true,
      ruleId: 'force_majeure_partial_tour'
    };
  }

  // ── 6. transport force majeure (flight disruption) ──
  if (input.cause === 'transport_force_majeure' || input.requestType === 'flight_disruption') {
    if (input.flightArrived) {
      return {
        ...base,
        outcome: 'itinerary_adjustment',
        eligibility: 'eligible',
        approvalRequired: true,
        ruleId: 'flight_delayed_arrived'
      };
    }
    if (input.verifiedEvent) {
      const pct = rules.flight_disruption_verified.recovery_fee_percent ?? 50;
      return {
        ...base,
        outcome: 'package_reactivation',
        eligibility: 'eligible',
        recoveryFee: Math.round((total * pct) / 100),
        evidenceRequired: true,
        approvalRequired: true,
        ruleId: 'flight_disruption_verified'
      };
    }
    // Unverified → treated as a voluntary late cancellation.
    const voluntary = evaluateCancellation({ ...input, requestType: 'full_cancellation', cause: 'voluntary' }, matrix);
    return {
      ...voluntary,
      warnings: ['Flight disruption not verified; treated as voluntary cancellation.', ...voluntary.warnings]
    };
  }

  // ── 7. JVTO operational cancellation ──
  if (input.cause === 'jvto_operational' || input.requestType === 'jvto_operational') {
    return {
      ...base,
      outcome: 'jvto_operational_remedy',
      eligibility: 'options',
      options: rules.jvto_operational.options ?? ['accepted_alternative', 'full_cash_refund'],
      approvalRequired: true,
      ruleId: 'jvto_operational'
    };
  }

  // ── 8. partial passenger cancellation ──
  if (input.requestType === 'partial_cancellation') {
    const cancelled = input.cancelledPax ?? 0;
    const remaining = input.booking.originalPax - cancelled;
    const { minimum_remaining_pax: minPax, minimum_remaining_percent: minPct } = matrix.partial_thresholds;
    const meetsPct = remaining >= Math.ceil((minPct / 100) * input.booking.originalPax);
    if (remaining < minPax || !meetsPct) {
      const reclassified = evaluateCancellation(
        { ...input, requestType: 'full_cancellation', cause: 'voluntary', cancelledPax: undefined },
        matrix
      );
      return {
        ...reclassified,
        warnings: [
          `Partial cancellation leaves ${remaining} paying traveller(s), below the threshold; reclassified as full cancellation.`,
          ...reclassified.warnings
        ]
      };
    }
    const cancelledFoc = input.cancelledFocPax ?? 0;
    const payingCancelled = Math.max(0, cancelled - cancelledFoc);
    let pct: number;
    let ruleId: string;
    if (tourStarted) {
      pct = rules.partial_after_day_1.cash_refund_percent ?? 0;
      ruleId = 'partial_after_day_1';
    } else if (beforeCutoff) {
      pct = rules.partial_gte_48h.cash_refund_percent ?? 100;
      ruleId = 'partial_gte_48h';
    } else {
      pct = rules.partial_lt_48h.cash_refund_percent ?? 50;
      ruleId = 'partial_lt_48h';
    }
    return {
      ...base,
      outcome: 'cash_refund',
      eligibility: 'eligible',
      refundPercent: pct,
      refundAmount: Math.round((perPerson * payingCancelled * pct) / 100),
      ruleId
    };
  }

  // ── 9. full voluntary cancellation ──
  if (beforeCutoff) {
    return {
      ...base,
      outcome: 'lifetime_package_credit',
      eligibility: 'eligible',
      packageCreditEligible: true,
      ruleId: 'full_voluntary_gte_48h'
    };
  }
  return { ...base, outcome: 'forfeited', eligibility: 'eligible', ruleId: 'full_voluntary_lt_48h' };
}

// ── Package Credit transfer guard (one complete transfer only) ──
export interface TransferInput {
  transferCount: number;
}

export function evaluateTransfer(
  input: TransferInput,
  matrix: DecisionMatrix
): { allowed: boolean; ruleId: string; reason?: string } {
  const locks = matrix.package_credit_locks;
  if (!locks.transfer_allowed) return { allowed: false, ruleId: 'transfer_disabled' };
  if (input.transferCount >= locks.maximum_transfers) {
    return { allowed: false, ruleId: 'transfer_limit_reached', reason: `maximum ${locks.maximum_transfers} transfer(s)` };
  }
  return { allowed: true, ruleId: 'transfer_ok' };
}

// ── Package Credit redemption guard ──
export interface RedemptionInput {
  status: 'active' | 'redeemed';
  targetPackageSameAsOriginal: boolean;
  splitRequested?: boolean;
  newPax: number;
  originalPax: number;
  perPersonPrice: number;
}

export function evaluateRedemption(
  input: RedemptionInput,
  matrix: DecisionMatrix
): { allowed: boolean; ruleId: string; incrementalCharge: number; refund: number; reason?: string } {
  const locks = matrix.package_credit_locks;
  if (input.status === 'redeemed') {
    return { allowed: false, ruleId: 'already_redeemed', incrementalCharge: 0, refund: 0, reason: 'credit already redeemed' };
  }
  if (!input.targetPackageSameAsOriginal && !locks.package_change_allowed) {
    return { allowed: false, ruleId: 'different_package_blocked', incrementalCharge: 0, refund: 0, reason: 'same package only' };
  }
  if (input.splitRequested && !locks.split_allowed) {
    return { allowed: false, ruleId: 'split_blocked', incrementalCharge: 0, refund: 0, reason: 'credit cannot be split' };
  }
  const delta = input.newPax - input.originalPax;
  if (delta > 0) {
    return {
      allowed: true,
      ruleId: 'redeem_more_pax_incremental',
      incrementalCharge: delta * input.perPersonPrice,
      refund: 0
    };
  }
  if (delta < 0) {
    // Fewer travellers yields no refund.
    return { allowed: true, ruleId: 'redeem_fewer_pax_no_refund', incrementalCharge: 0, refund: 0 };
  }
  return { allowed: true, ruleId: 'redeem_same', incrementalCharge: 0, refund: 0 };
}
