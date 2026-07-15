import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDecisionMatrix } from './cancellationPolicy.js';
import {
  evaluateCancellation,
  evaluateTransfer,
  evaluateRedemption,
  type CancellationInput,
  type CancellationBooking
} from './evaluateCancellation.js';

const matrix = loadDecisionMatrix();

const DAY_ONE = '2026-09-01T09:00:00.000Z';
const PER_PERSON = 3_200_000;
const TOTAL = 12_800_000; // 4 pax

function submittedHoursBefore(hours: number): string {
  return new Date(Date.parse(DAY_ONE) - hours * 3_600_000).toISOString();
}

type InputOverrides = Partial<Omit<CancellationInput, 'booking'>> & {
  hoursBefore?: number;
  booking?: Partial<CancellationBooking>;
};

function input(overrides: InputOverrides = {}): CancellationInput {
  const { hoursBefore = 60, booking, ...rest } = overrides;
  return {
    booking: {
      dayOneStartAt: DAY_ONE,
      originalPax: 4,
      confirmedTotalPrice: TOTAL,
      confirmedPerPersonPrice: PER_PERSON,
      ...booking
    },
    requestType: 'full_cancellation',
    cause: 'voluntary',
    submittedAt: submittedHoursBefore(hoursBefore),
    ...rest
  };
}

// ── matrix sanity ──
test('matrix is v2.0 with the locked numbers', () => {
  assert.equal(matrix.schema_version, 'cancellation-policy/v2.0');
  assert.equal(matrix.cutoff_hours, 48);
  assert.equal(matrix.rules.partial_lt_48h.cash_refund_percent, 50);
  assert.equal(matrix.rules.flight_disruption_verified.recovery_fee_percent, 50);
  assert.equal(matrix.package_credit_locks.maximum_transfers, 1);
});

// ── full cancellation ──
test('full cancellation 49h before → Package Credit', () => {
  const d = evaluateCancellation(input({ hoursBefore: 49 }), matrix);
  assert.equal(d.outcome, 'lifetime_package_credit');
  assert.equal(d.packageCreditEligible, true);
  assert.equal(d.refundPercent, 0);
});

test('full cancellation exactly 48h → Package Credit (inclusive)', () => {
  const d = evaluateCancellation(input({ hoursBefore: 48 }), matrix);
  assert.equal(d.outcome, 'lifetime_package_credit');
  assert.equal(d.ruleId, 'full_voluntary_gte_48h');
});

test('full cancellation 47h59m → forfeited', () => {
  const d = evaluateCancellation(input({ hoursBefore: 47 + 59 / 60 }), matrix);
  assert.equal(d.outcome, 'forfeited');
  assert.equal(d.ruleId, 'full_voluntary_lt_48h');
});

test('full cancellation after Day 1 → no refund', () => {
  const d = evaluateCancellation(input({ hoursBefore: -5 }), matrix);
  assert.equal(d.outcome, 'forfeited');
  assert.equal(d.ruleId, 'tour_started_no_refund');
});

test('no-show → forfeited', () => {
  const d = evaluateCancellation(input({ cause: 'no_show', hoursBefore: 60 }), matrix);
  assert.equal(d.outcome, 'forfeited');
  assert.equal(d.ruleId, 'no_show');
});

// ── partial cancellation ──
test('partial: 4 pax, one cancels at 60h → 100% per-person refund', () => {
  const d = evaluateCancellation(
    input({ requestType: 'partial_cancellation', cancelledPax: 1, hoursBefore: 60 }),
    matrix
  );
  assert.equal(d.outcome, 'cash_refund');
  assert.equal(d.refundPercent, 100);
  assert.equal(d.refundAmount, 3_200_000);
});

test('partial: 4 pax, one cancels at 20h → 50% refund', () => {
  const d = evaluateCancellation(
    input({ requestType: 'partial_cancellation', cancelledPax: 1, hoursBefore: 20 }),
    matrix
  );
  assert.equal(d.refundPercent, 50);
  assert.equal(d.refundAmount, 1_600_000);
});

test('partial: 4 pax, three cancel → reclassified as full cancellation', () => {
  const d = evaluateCancellation(
    input({ requestType: 'partial_cancellation', cancelledPax: 3, hoursBefore: 60 }),
    matrix
  );
  assert.equal(d.outcome, 'lifetime_package_credit');
  assert.ok(d.warnings.some((w) => w.includes('reclassified')));
});

test('partial: 3 pax, one cancels → threshold passes', () => {
  const d = evaluateCancellation(
    input({ booking: { originalPax: 3 }, requestType: 'partial_cancellation', cancelledPax: 1, hoursBefore: 60 }),
    matrix
  );
  assert.equal(d.outcome, 'cash_refund');
  assert.equal(d.refundPercent, 100);
});

test('partial: 2 pax, one cancels → threshold fails (reclassified)', () => {
  const d = evaluateCancellation(
    input({ booking: { originalPax: 2 }, requestType: 'partial_cancellation', cancelledPax: 1, hoursBefore: 60 }),
    matrix
  );
  assert.ok(d.warnings.some((w) => w.includes('reclassified')));
  assert.equal(d.outcome, 'lifetime_package_credit');
});

test('partial: FOC passenger cancels → IDR 0 refund', () => {
  const d = evaluateCancellation(
    input({ requestType: 'partial_cancellation', cancelledPax: 1, cancelledFocPax: 1, hoursBefore: 60 }),
    matrix
  );
  assert.equal(d.refundAmount, 0);
});

// ── Package Credit transfer + redemption ──
test('redeem same package, same pax → no price difference', () => {
  const r = evaluateRedemption(
    { status: 'active', targetPackageSameAsOriginal: true, newPax: 4, originalPax: 4, perPersonPrice: PER_PERSON },
    matrix
  );
  assert.equal(r.allowed, true);
  assert.equal(r.incrementalCharge, 0);
  assert.equal(r.refund, 0);
});

test('redeem fewer pax → no refund', () => {
  const r = evaluateRedemption(
    { status: 'active', targetPackageSameAsOriginal: true, newPax: 2, originalPax: 4, perPersonPrice: PER_PERSON },
    matrix
  );
  assert.equal(r.ruleId, 'redeem_fewer_pax_no_refund');
  assert.equal(r.refund, 0);
});

test('redeem more pax → incremental website charge', () => {
  const r = evaluateRedemption(
    { status: 'active', targetPackageSameAsOriginal: true, newPax: 6, originalPax: 4, perPersonPrice: PER_PERSON },
    matrix
  );
  assert.equal(r.incrementalCharge, 2 * PER_PERSON);
});

test('redeem different package → blocked', () => {
  const r = evaluateRedemption(
    { status: 'active', targetPackageSameAsOriginal: false, newPax: 4, originalPax: 4, perPersonPrice: PER_PERSON },
    matrix
  );
  assert.equal(r.allowed, false);
  assert.equal(r.ruleId, 'different_package_blocked');
});

test('redeem split → blocked', () => {
  const r = evaluateRedemption(
    { status: 'active', targetPackageSameAsOriginal: true, splitRequested: true, newPax: 4, originalPax: 4, perPersonPrice: PER_PERSON },
    matrix
  );
  assert.equal(r.allowed, false);
  assert.equal(r.ruleId, 'split_blocked');
});

test('redeem already-redeemed credit → blocked', () => {
  const r = evaluateRedemption(
    { status: 'redeemed', targetPackageSameAsOriginal: true, newPax: 4, originalPax: 4, perPersonPrice: PER_PERSON },
    matrix
  );
  assert.equal(r.allowed, false);
  assert.equal(r.ruleId, 'already_redeemed');
});

test('first transfer allowed, second transfer blocked', () => {
  assert.equal(evaluateTransfer({ transferCount: 0 }, matrix).allowed, true);
  assert.equal(evaluateTransfer({ transferCount: 1 }, matrix).allowed, false);
});

// ── force majeure ──
test('verified destination closure (full tour) → force-majeure options', () => {
  const d = evaluateCancellation(
    input({ requestType: 'destination_disruption', cause: 'destination_force_majeure', verifiedEvent: true, eventScope: 'full_tour' }),
    matrix
  );
  assert.equal(d.eligibility, 'options');
  assert.ok(d.options.includes('lifetime_package_credit'));
});

test('unverified destination report → blocked', () => {
  const d = evaluateCancellation(
    input({ requestType: 'destination_disruption', cause: 'destination_force_majeure', verifiedEvent: false }),
    matrix
  );
  assert.equal(d.eligibility, 'blocked');
  assert.equal(d.evidenceRequired, true);
});

test('verified flight cancellation → 50% Recovery Fee', () => {
  const d = evaluateCancellation(
    input({ requestType: 'flight_disruption', cause: 'transport_force_majeure', verifiedEvent: true }),
    matrix
  );
  assert.equal(d.outcome, 'package_reactivation');
  assert.equal(d.recoveryFee, TOTAL / 2);
});

test('customer misses flight (unverified, <48h) → late voluntary cancellation', () => {
  const d = evaluateCancellation(
    input({ requestType: 'flight_disruption', cause: 'transport_force_majeure', verifiedEvent: false, hoursBefore: 20 }),
    matrix
  );
  assert.equal(d.outcome, 'forfeited');
  assert.equal(d.ruleId, 'full_voluntary_lt_48h');
});

test('flight delayed but arrives → itinerary adjustment', () => {
  const d = evaluateCancellation(
    input({ requestType: 'flight_disruption', cause: 'transport_force_majeure', flightArrived: true }),
    matrix
  );
  assert.equal(d.outcome, 'itinerary_adjustment');
});

test('JVTO operational cancellation → full refund / alternative', () => {
  const d = evaluateCancellation(input({ requestType: 'jvto_operational', cause: 'jvto_operational' }), matrix);
  assert.equal(d.eligibility, 'options');
  assert.ok(d.options.includes('full_cash_refund'));
});

// ── financial protection / idempotency ──
test('duplicate active request → blocked', () => {
  const d = evaluateCancellation(input({ priorState: { activeRequestExists: true } }), matrix);
  assert.equal(d.eligibility, 'blocked');
  assert.equal(d.ruleId, 'idempotency_active_request');
});

test('already refunded → blocked', () => {
  const d = evaluateCancellation(input({ priorState: { alreadyRefunded: true } }), matrix);
  assert.equal(d.eligibility, 'blocked');
});

test('credit already issued + cash refund attempt → blocked (conflict)', () => {
  const d = evaluateCancellation(input({ priorState: { creditAlreadyIssued: true } }), matrix);
  assert.equal(d.eligibility, 'blocked');
  assert.equal(d.ruleId, 'idempotency_credit_issued');
});

test('recovery already used → blocked', () => {
  const d = evaluateCancellation(
    input({ requestType: 'flight_disruption', cause: 'transport_force_majeure', priorState: { recoveryUsed: true } }),
    matrix
  );
  assert.equal(d.eligibility, 'blocked');
  assert.equal(d.ruleId, 'idempotency_recovery_used');
});

// ── non-website booking guard ──
test('non-website booking source → rejected', () => {
  const d = evaluateCancellation(input({ booking: { bookingSource: 'whatsapp' } }), matrix);
  assert.equal(d.eligibility, 'blocked');
  assert.equal(d.ruleId, 'booking_source_invalid');
});

// ── determinism ──
test('identical input yields identical output', () => {
  const a = evaluateCancellation(input({ hoursBefore: 49 }), matrix);
  const b = evaluateCancellation(input({ hoursBefore: 49 }), matrix);
  assert.deepEqual(a, b);
});
