import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJvtoWeb } from '../extract/extract-jvto-web.js';
import { buildDestinationActivityProfiles } from './build-destination-activity-profiles.js';
import { buildOperationalEvents } from './build-operational-events.js';
import { buildRecommendationRules } from './build-recommendation-rules.js';
import { promoteJvtoWebDestinationIntelligence } from './jvto-web-enrich.js';

test('jvto-web extractor parses destination intelligence from the snapshot', async () => {
  const jvtoWeb = await extractJvtoWeb();
  assert.ok(jvtoWeb.destination_details.length >= 5, 'destination details parsed');
  const bromo = jvtoWeb.destination_details.find((d) => d.slug === 'mount-bromo');
  assert.equal(bromo?.altitude, 2329);
  assert.equal(bromo?.physical_demand, 3);
  assert.ok((bromo?.required_gear ?? []).includes('headlamp'));
});

test('promotion attaches jvto-web intelligence to datasets 06/07/12 (additive, with provenance)', async () => {
  const jvtoWeb = await extractJvtoWeb();
  const profiles = buildDestinationActivityProfiles();
  const events = buildOperationalEvents();
  const rules = buildRecommendationRules();
  const eventsBefore = events.length;
  const rulesBefore = rules.length;

  const promoted = promoteJvtoWebDestinationIntelligence(jvtoWeb, profiles, events, rules);
  assert.ok(promoted >= 5);

  // 06: Bromo profile gains a destination_intelligence block + jvto_web source_trace.
  const bromo = profiles.find((p) => p.destination_id === 'bromo');
  assert.ok(bromo?.destination_intelligence, 'bromo has destination_intelligence');
  assert.equal(bromo!.destination_intelligence!.altitude, 2329);
  assert.equal(bromo!.destination_intelligence!.difficulty_level, 'moderate');
  assert.ok(bromo!.source_trace.some((t) => t.source === 'jvto_web'));

  // 07: a per-destination access-requirements event with gear/permit/guide.
  assert.equal(events.length, eventsBefore + 5, 'one access-requirements event per source destination');
  const gear = events.find((e) => e.id === 'bromo_access_requirements');
  assert.ok(gear, 'bromo access requirements event added');
  assert.equal(gear!.event_type, 'destination_access_requirements');
  assert.ok((gear!.required_gear ?? []).includes('headlamp'));
  assert.equal(gear!.permit_required, true);
  assert.equal(gear!.guide_required, false);
  assert.deepEqual(gear!.cost_components, [], 'no cost tags so 10-joinability stays clean');
  assert.ok(gear!.source_trace.some((t) => t.source === 'jvto_web'));

  // 12: a per-destination weather/risk advisory rule (Ijen is hard + high risk).
  assert.equal(rules.length, rulesBefore + 5, 'one advisory rule per source destination');
  const ijen = rules.find((r) => r.id === 'ijen_weather_risk_advisory');
  assert.ok(ijen, 'ijen weather/risk advisory added');
  assert.ok((ijen!.risk_factors ?? []).length >= 1);
  assert.ok(ijen!.weather_by_season);
  assert.ok(['low', 'medium', 'high', 'critical'].includes(ijen!.severity));
});

test('promotion is a no-op when no destination details are present', () => {
  const empty = { destination_details: [] } as unknown as Awaited<ReturnType<typeof extractJvtoWeb>>;
  const profiles = buildDestinationActivityProfiles();
  const events = buildOperationalEvents();
  const rules = buildRecommendationRules();
  const promoted = promoteJvtoWebDestinationIntelligence(empty, profiles, events, rules);
  assert.equal(promoted, 0);
  assert.ok(profiles.every((p) => p.destination_intelligence === undefined));
});
