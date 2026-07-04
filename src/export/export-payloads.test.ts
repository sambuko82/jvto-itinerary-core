import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_DIR } from '../config/paths.js';
import { readJson } from '../utils/fs.js';
import { whatsappPayloadSchema, pdfPayloadSchema } from '../schemas/exportSchemas.js';
import { buildAllWhatsappPayloads } from './whatsapp-payload.js';
import { buildAllPdfPayloads } from './pdf-payload.js';
import { loadPackageBundles } from './package-data.js';

interface PricingPaxTier {
  min_pax: number;
  max_pax: number | null;
  idr_per_person: number;
}

interface PricingPackage {
  package_id: string;
  pax_tiers: PricingPaxTier[];
}

interface PricingFile {
  packages: PricingPackage[];
}

function pricingIdForPackageKey(packageKey: string): string {
  return packageKey.startsWith('bali/') ? `${packageKey.slice('bali/'.length)}-bali` : packageKey;
}

test('exactly 16 canonical packages are loaded', async () => {
  const bundles = await loadPackageBundles();
  assert.equal(bundles.length, 16);
  const ids = new Set(bundles.map((b) => b.package_id));
  assert.equal(ids.size, 16, 'package_id values must be unique');
});

test('all 16 packages produce a schema-valid whatsapp payload', async () => {
  const results = await buildAllWhatsappPayloads();
  assert.equal(results.length, 16);
  for (const { package_id, payload } of results) {
    const parsed = whatsappPayloadSchema.safeParse(payload);
    assert.ok(parsed.success, `whatsapp payload for ${package_id} failed schema: ${parsed.success ? '' : parsed.error.message}`);
  }
});

test('all 16 packages produce a schema-valid pdf payload', async () => {
  const results = await buildAllPdfPayloads();
  assert.equal(results.length, 16);
  for (const { package_id, payload } of results) {
    const parsed = pdfPayloadSchema.safeParse(payload);
    assert.ok(parsed.success, `pdf payload for ${package_id} failed schema: ${parsed.success ? '' : parsed.error.message}`);
  }
});

test('wa_message_en never pairs "guarantee(d)" with "blue fire"', async () => {
  const results = await buildAllWhatsappPayloads();
  for (const { package_id, payload } of results) {
    const message = payload.wa_message_en;
    const blueFireIdx = message.toLowerCase().indexOf('blue fire');
    if (blueFireIdx === -1) continue;
    // Check the whole message (not just a local window) for the banned words,
    // since a "we guarantee X" earlier in the message would still read as a
    // promise once the reader reaches the blue fire mention.
    assert.doesNotMatch(
      message,
      /guarantee(d)?/i,
      `wa_message_en for ${package_id} mentions blue fire and also uses guarantee/guaranteed: ${message}`
    );
  }
});

test('wa_message_en stays within the 900-char / 3-emoji budget', async () => {
  const results = await buildAllWhatsappPayloads();
  for (const { package_id, payload } of results) {
    assert.ok(payload.wa_message_en.length <= 900, `wa_message_en for ${package_id} exceeds 900 chars`);
    const emojiCount = (payload.wa_message_en.match(/\p{Extended_Pictographic}/gu) ?? []).length;
    assert.ok(emojiCount <= 3, `wa_message_en for ${package_id} has more than 3 emoji`);
  }
});

test('price bands in both payloads match 16-package-pricing.json exactly (no drift)', async () => {
  const pricing = await readJson<PricingFile>(`${GENERATED_DIR}/16-package-pricing.json`);
  const pricingById = new Map(pricing.packages.map((p) => [p.package_id, p]));

  const bundles = await loadPackageBundles();
  const whatsappResults = await buildAllWhatsappPayloads();
  const pdfResults = await buildAllPdfPayloads();
  const waByKey = new Map(whatsappResults.map((r) => [r.package_id, r.payload]));
  const pdfByKey = new Map(pdfResults.map((r) => [r.package_id, r.payload]));

  for (const bundle of bundles) {
    const expected = pricingById.get(pricingIdForPackageKey(bundle.package_id));
    assert.ok(expected, `no pricing entry for ${bundle.package_id}`);

    const wa = waByKey.get(bundle.package_id);
    const pdf = pdfByKey.get(bundle.package_id);
    assert.ok(wa && pdf);

    for (const payload of [wa, pdf]) {
      const bands = 'price_bands' in payload ? payload.price_bands.bands : payload.price_table.bands;
      assert.equal(bands.length, expected!.pax_tiers.length, `band count mismatch for ${bundle.package_id}`);
      for (let i = 0; i < bands.length; i++) {
        assert.equal(bands[i].min_pax, expected!.pax_tiers[i].min_pax, `min_pax drift for ${bundle.package_id} tier ${i}`);
        assert.equal(bands[i].max_pax, expected!.pax_tiers[i].max_pax, `max_pax drift for ${bundle.package_id} tier ${i}`);
        assert.equal(
          bands[i].idr_per_person,
          expected!.pax_tiers[i].idr_per_person,
          `idr_per_person drift for ${bundle.package_id} tier ${i}`
        );
      }
    }
  }
});

test('the two named sample packages resolve to the expected package_key spelling', async () => {
  const bundles = await loadPackageBundles();
  const ids = new Set(bundles.map((b) => b.package_id));
  // bromo-2d1n exists standalone; the plain "bromo-ijen-3d2n" does not exist
  // in the agent-contract 16-package set (only the Bali-origin variant does).
  assert.ok(ids.has('bromo-2d1n'));
  assert.ok(ids.has('bali/bromo-ijen-3d2n'));
});

test('regression (Codex): a 1-stop, 2-day package puts the transfer/staging on day 1, the overnight activity on day 2', async () => {
  const results = await buildAllPdfPayloads();
  for (const packageId of ['bromo-2d1n', 'ijen-2d1n']) {
    const result = results.find((r) => r.package_id === packageId);
    assert.ok(result, `missing pdf payload for ${packageId}`);
    const days = result!.payload.itinerary_days;
    assert.equal(days.length, 2, `${packageId} should have exactly 2 itinerary days`);

    const day1Activities = days[0].segments.map((s) => s.activity);
    const day2Activities = days[1].segments.map((s) => s.activity);

    // Day 1: exactly the origin pickup, the transfer-in, and the evening staging.
    assert.equal(day1Activities.length, 3, `${packageId} day 1 should have exactly 3 segments (pickup, transfer, staging), got: ${day1Activities.join(', ')}`);
    assert.equal(day1Activities[0], 'Pickup');
    assert.ok(day1Activities[1].startsWith('Transfer:'), `${packageId} day 1 segment 2 should be the transfer-in`);
    assert.ok(day1Activities[2].startsWith('Staging:'), `${packageId} day 1 segment 3 should be the evening staging`);

    // Day 2: the transfer/staging must NOT repeat here, and the main activity must be present.
    assert.ok(
      !day2Activities.some((a) => a.startsWith('Transfer:') || a.startsWith('Staging:')),
      `${packageId} day 2 must not repeat the transfer/staging — those belong on day 1 only`
    );
    assert.ok(day2Activities.length > 0, `${packageId} day 2 must contain the main activity`);
  }
});

test('regression (Codex): Ijen screening-location note matches the actual matched staging, never hardcoded', async () => {
  const results = await buildAllPdfPayloads();

  const suraIjen = results.find((r) => r.package_id === 'ijen-2d1n');
  const suraStaging = suraIjen!.payload.itinerary_days.flatMap((d) => d.segments).find((s) => s.activity.startsWith('Staging:'));
  assert.ok(suraStaging!.notes.includes('Bondowoso hotel'), 'Surabaya-origin Ijen staging must reference the Bondowoso hotel');
  assert.ok(!suraStaging!.notes.includes('Banyuwangi hotel'), 'Surabaya-origin Ijen staging must not mention Banyuwangi');

  const baliIjen = results.find((r) => r.package_id === 'bali/bromo-ijen-3d2n');
  const baliStagingSegments = baliIjen!.payload.itinerary_days.flatMap((d) => d.segments).filter((s) => s.activity.startsWith('Staging:'));
  const baliIjenStaging = baliStagingSegments.find((s) => s.activity.toLowerCase().includes('banyuwangi'));
  assert.ok(baliIjenStaging, 'bali/bromo-ijen-3d2n must have a Banyuwangi staging segment');
  assert.ok(baliIjenStaging!.notes.includes('Banyuwangi hotel'), 'Bali-origin Ijen staging must reference the Banyuwangi hotel');
  assert.ok(!baliIjenStaging!.notes.includes('Bondowoso hotel'), 'Bali-origin Ijen staging must not contradict itself with a Bondowoso mention');
});

test('regression (Codex): the same Bondowoso/Banyuwangi fix applies to mandatory_notes and pdf inclusions, not just itinerary_days', async () => {
  const pdfResults = await buildAllPdfPayloads();
  const waResults = await buildAllWhatsappPayloads();

  const suraPdf = pdfResults.find((r) => r.package_id === 'ijen-2d1n')!.payload;
  const suraWa = waResults.find((r) => r.package_id === 'ijen-2d1n')!.payload;
  assert.ok(suraPdf.inclusions.some((i) => i.includes('Bondowoso hotel')), 'ijen-2d1n pdf inclusions must reference the Bondowoso hotel');
  assert.ok(!suraPdf.inclusions.some((i) => i.includes('Banyuwangi')), 'ijen-2d1n pdf inclusions must not mention Banyuwangi');
  assert.ok(suraWa.mandatory_notes.some((n) => n.includes('Bondowoso hotel')), 'ijen-2d1n mandatory_notes must reference the Bondowoso hotel');

  const baliPdf = pdfResults.find((r) => r.package_id === 'bali/bromo-ijen-3d2n')!.payload;
  const baliWa = waResults.find((r) => r.package_id === 'bali/bromo-ijen-3d2n')!.payload;
  assert.ok(baliPdf.inclusions.some((i) => i.includes('Banyuwangi hotel')), 'bali/bromo-ijen-3d2n pdf inclusions must reference the Banyuwangi hotel');
  assert.ok(!baliPdf.inclusions.some((i) => i.includes('Bondowoso')), 'bali/bromo-ijen-3d2n pdf inclusions must not contradict itself with Bondowoso');
  assert.ok(baliWa.mandatory_notes.some((n) => n.includes('Banyuwangi hotel')), 'bali/bromo-ijen-3d2n mandatory_notes must reference the Banyuwangi hotel');
  assert.ok(!baliWa.mandatory_notes.some((n) => n.includes('Bondowoso')), 'bali/bromo-ijen-3d2n mandatory_notes must not contradict itself with Bondowoso');
});
