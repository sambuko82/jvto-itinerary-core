import { access } from 'node:fs/promises';
import { GENERATED_DIR, EXPORT_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { resolveCostId } from '../config/cost-aliases.js';
import {
  validateArray,
  validateObject,
  nonEmptyArraySchema,
  pickupContextSchema,
  dropoffContextSchema,
  routeLegSchema,
  costComponentSchema,
  manifestSchema,
  scenarioPreviewSchema,
  exportPayloadSchema
} from '../schemas/generatedSchemas.js';

const generatedFiles = [
  '01-pickup-contexts.json',
  '02-dropoff-contexts.json',
  '03-time-window-rules.json',
  '04-route-leg-index.json',
  '05-road-situation-profiles.json',
  '06-destination-activity-profiles.json',
  '07-operational-events.json',
  '08-meal-logic.json',
  '09-accommodation-logic.json',
  '10-cost-components.json',
  '11-package-route-map.json',
  '12-recommendation-rules.json',
  '13-visual-map-layer.json',
  '14-output-template-map.json',
  '15-scenario-preview-sample.json'
] as const;

const AGENT_CONTRACT_DIR = `${GENERATED_DIR}/agent-contract`;

const agentContractFiles = [
  'destination-operational-overlays.json',
  'manifest.json',
  'operational-readiness.json',
  'package-customization-boundaries.json',
  'package-operational-composition.json',
  'pickup-dropoff-requirements.json',
  'route-validation-rules.json',
  'staging-logic.json',
  'standard-route-truth.json'
] as const;

const exportPayloadFiles = [
  `${EXPORT_DIR}/page-payload/sample-itinerary-page.json`,
  `${EXPORT_DIR}/pdf-payload/sample-itinerary-pdf.json`,
  `${EXPORT_DIR}/whatsapp-payload/sample-whatsapp-summary.json`,
  `${EXPORT_DIR}/internal-ops-payload/sample-internal-ops.json`,
  `${EXPORT_DIR}/ai-context-pack/sample-ai-context.json`
] as const;

const rawPiiKeys = new Set([
  'name',
  'full_name',
  'customer_name',
  'guest_name',
  'email',
  'email_address',
  'phone',
  'phone_number',
  'mobile',
  'mobile_number',
  'whatsapp',
  'whatsapp_number',
  'passport',
  'passport_number',
  'contact_name',
  'contact_phone',
  'raw_customer',
  'raw_booking',
  'booking_contact'
]);

const requiredPickupIds = [
  'surabaya_airport_pickup',
  'surabaya_hotel_pickup',
  'surabaya_train_station_pickup',
  'ketapang_harbor_pickup',
  'surabaya_city_point_pickup',
  'custom_address_pickup',
  'previous_tour_dropoff_pickup'
] as const;

const requiredDropoffIds = [
  'ketapang_harbor_dropoff',
  'surabaya_airport_dropoff',
  'bali_hotel_dropoff',
  'surabaya_hotel_dropoff',
  'surabaya_train_station_dropoff',
  'malang_dropoff',
  'custom_address_dropoff'
] as const;

const requiredRouteLegIds = [
  'surabaya_airport_to_bromo_area',
  'surabaya_hotel_to_bromo_area',
  'surabaya_to_bondowoso_ijen_area',
  'surabaya_to_tumpak_sewu',
  'tumpak_sewu_to_bromo_area',
  'bromo_area_to_madakaripura',
  'bromo_area_to_bondowoso_ijen_area',
  'bondowoso_to_ijen_base',
  'banyuwangi_to_ijen_base',
  'ijen_base_to_ketapang_harbor',
  'ketapang_harbor_to_gilimanuk_bali_side',
  'bali_hotel_area_to_banyuwangi_ijen_area',
  'bromo_area_to_malang',
  'malang_to_surabaya'
] as const;

const requiredRoadProfileIds = [
  'city_exit',
  'toll_road',
  'intercity_road',
  'mountain_access',
  'village_road',
  'waterfall_access_road',
  'ferry_crossing',
  'national_park_access',
  'night_drive',
  'weekend_congestion',
  'rain_sensitive_road'
] as const;

const requiredDestinationIds = ['bromo', 'ijen', 'tumpak_sewu', 'madakaripura', 'papuma', 'malang_batu', 'surabaya_city', 'bali_ketapang'] as const;

async function assertExists(path: string): Promise<void> {
  await access(path);
}

function assertNoRawPiiKeys(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawPiiKeys(item, `${path}[${index}]`));
    return;
  }

  if (!value || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (rawPiiKeys.has(normalizedKey)) {
      throw new Error(`raw PII key "${key}" found at ${path}`);
    }
    assertNoRawPiiKeys(nested, `${path}.${key}`);
  }
}

function assertContainsIds(name: string, data: unknown, expectedIds: readonly string[]): void {
  if (!Array.isArray(data)) throw new Error(`${name} must be an array`);
  const actualIds = new Set(data.map((item) => (item && typeof item === 'object' && 'id' in item ? String(item.id) : '')));
  const missing = expectedIds.filter((id) => !actualIds.has(id));
  if (missing.length > 0) {
    throw new Error(`${name} missing required ids: ${missing.join(', ')}`);
  }
}

function assertContainsDestinationIds(data: unknown, expectedIds: readonly string[]): void {
  if (!Array.isArray(data)) throw new Error('destination activity profiles must be an array');
  const actualIds = new Set(data.map((item) => (item && typeof item === 'object' && 'destination_id' in item ? String(item.destination_id) : '')));
  const missing = expectedIds.filter((id) => !actualIds.has(id));
  if (missing.length > 0) {
    throw new Error(`destination activity profiles missing required destination ids: ${missing.join(', ')}`);
  }
}

// Cross-reference: every cost tag used by route legs (04), destination profiles
// (06), and operational events (07) must resolve to a canonical id in
// 10-cost-components.json (directly or via the alias map). Unresolved tags = drift.
function assertCostJoinability(
  costComponents: unknown,
  routeLegs: unknown,
  destinationProfiles: unknown,
  operationalEvents: unknown
): void {
  if (!Array.isArray(costComponents)) throw new Error('cost components must be an array');
  const canonical = new Set(costComponents.map((c) => (c && typeof c === 'object' && 'id' in c ? String(c.id) : '')));
  const unresolved = new Set<string>();
  const scan = (rows: unknown, field: string) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const tags = row && typeof row === 'object' && field in row ? (row as Record<string, unknown>)[field] : undefined;
      if (!Array.isArray(tags)) continue;
      for (const tag of tags) {
        if (typeof tag !== 'string') continue;
        if (resolveCostId(tag, canonical) === null) unresolved.add(tag);
      }
    }
  };
  scan(routeLegs, 'cost_impacts');
  scan(destinationProfiles, 'cost_components');
  scan(operationalEvents, 'cost_components');
  if (unresolved.size > 0) {
    throw new Error(`cost tags not joinable to 10-cost-components.json (add to registry or COST_ALIASES): ${[...unresolved].sort().join(', ')}`);
  }
}

// Minimal shape check for the agent-contract layer (jvto-whatsapp-agent-runtime
// consumer). Deep business-rule assertions live in src/validate/agent-contract.test.ts;
// this only guards against the build step silently regressing to a missing or
// empty file, since it now runs as part of every build:all.
function assertAgentContractShape(standardRouteTruth: unknown, routeValidationRules: unknown): void {
  const packages = standardRouteTruth && typeof standardRouteTruth === 'object' && 'packages' in standardRouteTruth
    ? (standardRouteTruth as { packages: unknown }).packages
    : undefined;
  if (!Array.isArray(packages) || packages.length !== 16) {
    throw new Error(`agent-contract standard-route-truth.json must have exactly 16 packages, got ${Array.isArray(packages) ? packages.length : 'not an array'}`);
  }

  if (!Array.isArray(routeValidationRules) || routeValidationRules.length === 0) {
    throw new Error('agent-contract route-validation-rules.json must be a non-empty array');
  }
  for (const rule of routeValidationRules) {
    const r = rule as Record<string, unknown>;
    if (!r || typeof r !== 'object' || !r.rule_id) throw new Error('agent-contract route-validation-rules.json: rule missing rule_id');
    if (!r.severity) throw new Error(`agent-contract route-validation-rules.json: rule ${r.rule_id} missing severity`);
    if (!Array.isArray(r.source_refs) || r.source_refs.length === 0) {
      throw new Error(`agent-contract route-validation-rules.json: rule ${r.rule_id} missing non-empty source_refs`);
    }
    if (!r.consumed_by) throw new Error(`agent-contract route-validation-rules.json: rule ${r.rule_id} missing consumed_by`);
  }
}

export async function validateGeneratedData() {
  for (const file of generatedFiles) {
    await assertExists(`${GENERATED_DIR}/${file}`);
  }

  for (const file of exportPayloadFiles) {
    await assertExists(file);
  }

  for (const file of agentContractFiles) {
    await assertExists(`${AGENT_CONTRACT_DIR}/${file}`);
  }

  const pickupContexts = await readJson(`${GENERATED_DIR}/01-pickup-contexts.json`);
  const dropoffContexts = await readJson(`${GENERATED_DIR}/02-dropoff-contexts.json`);
  const routeLegIndex = await readJson(`${GENERATED_DIR}/04-route-leg-index.json`);
  const roadSituationProfiles = await readJson(`${GENERATED_DIR}/05-road-situation-profiles.json`);
  const destinationActivityProfiles = await readJson(`${GENERATED_DIR}/06-destination-activity-profiles.json`);
  const costComponents = await readJson(`${GENERATED_DIR}/10-cost-components.json`);
  const scenarioPreview = await readJson(`${GENERATED_DIR}/15-scenario-preview-sample.json`);
  const manifest = await readJson(`${GENERATED_DIR}/manifest.json`);

  validateArray('pickup contexts', pickupContextSchema, pickupContexts);
  validateArray('dropoff contexts', dropoffContextSchema, dropoffContexts);
  validateArray('route leg index', routeLegSchema, routeLegIndex);
  validateArray('cost components', costComponentSchema, costComponents);
  validateObject('scenario preview', scenarioPreviewSchema, scenarioPreview);
  validateObject('manifest', manifestSchema, manifest);
  assertContainsIds('pickup contexts', pickupContexts, requiredPickupIds);
  assertContainsIds('dropoff contexts', dropoffContexts, requiredDropoffIds);
  assertContainsIds('route leg index', routeLegIndex, requiredRouteLegIds);
  assertContainsIds('road situation profiles', roadSituationProfiles, requiredRoadProfileIds);
  assertContainsDestinationIds(destinationActivityProfiles, requiredDestinationIds);

  const operationalEvents = await readJson(`${GENERATED_DIR}/07-operational-events.json`);
  assertCostJoinability(costComponents, routeLegIndex, destinationActivityProfiles, operationalEvents);

  const standardRouteTruth = await readJson(`${AGENT_CONTRACT_DIR}/standard-route-truth.json`);
  const routeValidationRules = await readJson(`${AGENT_CONTRACT_DIR}/route-validation-rules.json`);
  assertAgentContractShape(standardRouteTruth, routeValidationRules);

  for (const file of generatedFiles.filter((file) => file !== '15-scenario-preview-sample.json')) {
    validateObject(file, nonEmptyArraySchema, await readJson(`${GENERATED_DIR}/${file}`));
  }

  for (const file of exportPayloadFiles) {
    validateObject(file, exportPayloadSchema, await readJson(file));
  }

  const scannedFiles = [
    ...generatedFiles.map((file) => `${GENERATED_DIR}/${file}`),
    `${GENERATED_DIR}/manifest.json`,
    ...exportPayloadFiles,
    ...agentContractFiles.map((file) => `${AGENT_CONTRACT_DIR}/${file}`)
  ];

  for (const file of scannedFiles) {
    assertNoRawPiiKeys(await readJson(file), file);
  }

  return {
    ok: true,
    generated_files: generatedFiles.length,
    export_payloads: exportPayloadFiles.length,
    agent_contract_files: agentContractFiles.length,
    pii_policy: 'no_raw_customer_pii'
  };
}
