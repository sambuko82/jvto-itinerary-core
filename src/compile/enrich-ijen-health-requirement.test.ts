import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OperationalEvent } from '../domain/operations.js';
import { enrichIjenHealthRequirement } from './enrich-ijen-health-requirement.js';

function ijenAccessEvent(): OperationalEvent {
  return {
    id: 'ijen_access_requirements',
    label: 'Ijen Crater access requirements (gear, permits, guide)',
    status: 'active',
    confidence: 'inferred',
    event_type: 'destination_access_requirements',
    applies_when: ['destination includes ijen'],
    customer_visible: true,
    cost_components: [],
    required_gear: ['gas_mask', 'headlamp'],
    permit_required: true,
    guide_required: true,
    source_trace: [
      { source: 'jvto_web', ref: 'jvto-web:publicContent/generated/destinationDetailSnapshots.json', confidence: 'inferred' }
    ]
  };
}

test('enrich attaches the regulatory health-certificate gate to ijen_access_requirements', () => {
  const events = [ijenAccessEvent()];
  const traceBefore = events[0].source_trace.length;

  const enriched = enrichIjenHealthRequirement(events);
  assert.equal(enriched, true);

  const event = events.find((e) => e.id === 'ijen_access_requirements')!;
  assert.equal(event.health_certificate_required, true);
  assert.ok(event.health_screening, 'health_screening block present');
  assert.equal(event.health_screening!.mandatory, true);
  assert.equal(event.health_screening!.effective, '2024-01-06');
  assert.match(event.health_screening!.document, /surat keterangan sehat/i);
  // The hypertension eligibility qualifier from the source criteria must survive.
  assert.match(event.health_screening!.criteria!, /no hypertension/i);

  // Additive: gear/permit/guide untouched, a research source_trace appended.
  assert.deepEqual(event.required_gear, ['gas_mask', 'headlamp']);
  assert.equal(event.permit_required, true);
  assert.equal(event.source_trace.length, traceBefore + 1);
  const added = event.source_trace[event.source_trace.length - 1];
  assert.equal(added.source, 'manual_seed');
  assert.equal(added.ref, 'seed/research/east-java-field-data-2026.json');
  assert.equal(added.field, 'ijen_rules.medical_check');
});

test('enrich is a no-op when the ijen access event is absent (no fabrication)', () => {
  const events: OperationalEvent[] = [];
  const enriched = enrichIjenHealthRequirement(events);
  assert.equal(enriched, false);
  assert.equal(events.length, 0);
});
