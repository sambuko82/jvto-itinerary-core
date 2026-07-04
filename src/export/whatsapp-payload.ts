import { fileURLToPath } from 'node:url';
import { EXPORT_DIR } from '../config/paths.js';
import { writeJson } from '../utils/fs.js';
import { validateObject } from '../schemas/generatedSchemas.js';
import { whatsappPayloadSchema, type WhatsappPayload } from '../schemas/exportSchemas.js';
import {
  loadPackageBundles,
  fileSafePackageId,
  buildMandatoryNotes,
  buildCurrentAdvisories,
  baseSourceTrace,
  type PackageBundle
} from './package-data.js';

const MAX_WA_MESSAGE_CHARS = 900;
const MAX_EMOJI = 3;

function lowestPricePerPerson(bundle: PackageBundle): number {
  return Math.min(...bundle.price.bands.map((b) => b.idr_per_person));
}

function formatIdr(amount: number): string {
  return amount.toLocaleString('en-US');
}

function buildWaMessage(bundle: PackageBundle): string {
  const routeLine = bundle.nodes.join(' → ');
  const fromPrice = formatIdr(lowestPricePerPerson(bundle));
  // Blue fire is intentionally excluded from the message's own highlight
  // pick (though it stays in the full `highlights` field): it's a weather-
  // dependent sighting, not a guaranteed attraction, and we don't want it
  // read as a promise in the customer-facing message itself.
  const topHighlights = bundle.highlights.filter((h) => !/blue fire/i.test(h)).slice(0, 2);

  const goodToKnow: string[] = [];
  if (bundle.includesBromo) goodToKnow.push('Bromo mornings 5-15°C, warm layers needed');
  if (bundle.includesIjen) {
    goodToKnow.push('Ijen 10-15°C, gas mask provided & sterilized, health screening mandatory pre-trek');
    goodToKnow.push('blue fire depends on the weather that night, so it can\'t be promised');
  }
  const advisories = buildCurrentAdvisories(bundle).map((a) =>
    a
      .replace('Madakaripura Waterfall is currently inaccessible due to bridge flood damage; this stop is suspended until further notice.', 'Madakaripura currently closed (bridge flood damage).')
      .replace('The Ijen crater floor (close approach to the blue fire site and lake shore) is currently closed; viewing is from the crater rim only.', 'Ijen crater floor currently closed (rim access only).')
  );

  const bookingLine = bundle.instant_book_eligible
    ? 'Available for instant booking.'
    : `Needs a quick check before booking${bundle.gated_reason ? ` (${bundle.gated_reason})` : ''} — we'll confirm within the day.`;

  const lines = [
    `Hi! Here's the ${bundle.display_name} (${bundle.duration}) 🌋`,
    '',
    `Route: ${routeLine}`,
    `From IDR ${fromPrice}/pax (lower per-person rate for bigger groups)`,
    topHighlights.length > 0 ? `Highlights: ${topHighlights.join(', ')}` : null,
    goodToKnow.length > 0 ? `Good to know: ${goodToKnow.join('; ')}.` : null,
    advisories.length > 0 ? `Advisory: ${advisories.join(' ')}` : null,
    bookingLine,
    '',
    'Want a tailored quote? Share your dates & group size! 😊'
  ].filter((line): line is string => line !== null);

  const message = lines.join('\n');
  if (message.length > MAX_WA_MESSAGE_CHARS) {
    throw new Error(
      `wa_message_en for "${bundle.package_id}" is ${message.length} chars, exceeds ${MAX_WA_MESSAGE_CHARS}-char budget`
    );
  }
  const emojiCount = (message.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emojiCount > MAX_EMOJI) {
    throw new Error(`wa_message_en for "${bundle.package_id}" has ${emojiCount} emoji, exceeds max of ${MAX_EMOJI}`);
  }
  return message;
}

export function buildWhatsappPayload(bundle: PackageBundle): WhatsappPayload {
  const payload: WhatsappPayload = {
    id: `whatsapp-payload:${bundle.package_id}`,
    label: `WhatsApp payload — ${bundle.display_name}`,
    status: 'active',
    confidence: 'inferred',
    source_trace: baseSourceTrace(),
    package_id: bundle.package_id,
    display_name: bundle.display_name,
    duration: bundle.duration,
    price_bands: bundle.price,
    route_summary: bundle.nodes,
    highlights: bundle.highlights,
    mandatory_notes: buildMandatoryNotes(bundle),
    current_advisories: buildCurrentAdvisories(bundle),
    instant_book_eligible: bundle.instant_book_eligible,
    gated_reason: bundle.gated_reason,
    wa_message_en: buildWaMessage(bundle)
  };

  validateObject(`whatsapp-payload:${bundle.package_id}`, whatsappPayloadSchema, payload);
  return payload;
}

export async function buildAllWhatsappPayloads(): Promise<Array<{ package_id: string; payload: WhatsappPayload }>> {
  const bundles = await loadPackageBundles();
  return bundles.map((bundle) => ({ package_id: bundle.package_id, payload: buildWhatsappPayload(bundle) }));
}

async function main() {
  const results = await buildAllWhatsappPayloads();
  for (const { package_id, payload } of results) {
    const path = `${EXPORT_DIR}/whatsapp-payload/output/${fileSafePackageId(package_id)}.json`;
    await writeJson(path, payload);
    console.log(`wrote ${path}`);
  }
  console.log(`Generated ${results.length} whatsapp-payload files.`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
