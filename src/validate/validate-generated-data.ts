import { access } from 'node:fs/promises';
import { GENERATED_DIR, EXPORT_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { evaluateScenario } from '../scenario/index.js';
import type { RawScenarioInput } from '../scenario/types.js';
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

export async function validateGeneratedData() {
  for (const file of generatedFiles) {
    await assertExists(`${GENERATED_DIR}/${file}`);
  }

  for (const file of exportPayloadFiles) {
    await assertExists(file);
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

  for (const file of generatedFiles.filter((file) => file !== '15-scenario-preview-sample.json')) {
    validateObject(file, nonEmptyArraySchema, await readJson(`${GENERATED_DIR}/${file}`));
  }

  for (const file of exportPayloadFiles) {
    validateObject(file, exportPayloadSchema, await readJson(file));
  }

  const scannedFiles = [
    ...generatedFiles.map((file) => `${GENERATED_DIR}/${file}`),
    `${GENERATED_DIR}/manifest.json`,
    ...exportPayloadFiles
  ];

  for (const file of scannedFiles) {
    assertNoRawPiiKeys(await readJson(file), file);
  }

  // Minimal scenario-evaluator smoke check: the canonical late-Ketapang sample must evaluate
  // to possible_with_warning, surface operational events + cost components, and emit no raw PII.
  const sampleScenario = await readJson<RawScenarioInput>(
    'samples/customer-scenario-surabaya-airport-late-bromo-ijen-ketapang.json'
  );
  const evaluation = await evaluateScenario(sampleScenario);
  if (evaluation.status !== 'possible_with_warning') {
    throw new Error(`scenario smoke check expected status possible_with_warning, got ${evaluation.status}`);
  }
  if (evaluation.operational_events.length === 0) {
    throw new Error('scenario smoke check expected non-empty operational_events');
  }
  if (evaluation.cost_components.length === 0) {
    throw new Error('scenario smoke check expected non-empty cost_components');
  }
  assertNoRawPiiKeys(evaluation, 'scenario_evaluation');

  return {
    ok: true,
    generated_files: generatedFiles.length,
    export_payloads: exportPayloadFiles.length,
    pii_policy: 'no_raw_customer_pii',
    scenario_smoke: 'ok'
  };
}
