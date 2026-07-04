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
