import { fileURLToPath } from 'node:url';
import { EXPORT_DIR } from '../config/paths.js';
import { writeJson } from '../utils/fs.js';
import { validateObject } from '../schemas/generatedSchemas.js';
import { pdfPayloadSchema, type PdfPayload } from '../schemas/exportSchemas.js';
import {
  loadPackageBundles,
  fileSafePackageId,
  buildMandatoryNotes,
  buildCurrentAdvisories,
  baseSourceTrace,
  CONTACT_EMAIL,
  DEPOSIT_TERMS,
  BANK_OPTIONS,
  type PackageBundle
} from './package-data.js';

/**
 * Inclusions/exclusions are derived from `10-cost-components.json`:
 *  - `customer_visible: "included_in_package"` components matched to the
 *    package's destinations (bromo/ijen/madakaripura/tumpak_sewu) become
 *    inclusion lines.
 *  - Universal private-tour costs that are `customer_visible: false` in that
 *    dataset (vehicle, driver, parking/toll) are NOT hidden costs to the
 *    guest -- `customer_visible: false` there means "not itemized as its own
 *    priced line item", not "excluded from the package". They're stated as
 *    generic inclusion lines here (no rate exposed), matching how every JVTO
 *    private-tour package is marketed.
 *  - Exclusions combine the two genuinely optional/customer-priced cost
 *    components (`bali_dropoff_after_ketapang`, `addon_activity`) with
 *    standard tour-quotation boilerplate (flights, insurance, personal
 *    expenses) that isn't itself a dataset field but is universal industry
 *    practice for any private-tour quotation.
 */
function buildInclusions(bundle: PackageBundle): string[] {
  const inclusions = ['Private air-conditioned vehicle & driver for the full itinerary', 'Parking, toll, and fuel allowance'];

  if (bundle.price.ferry_included) inclusions.push('Ferry crossing (Ketapang–Gilimanuk)');
  if (bundle.includesBromo) {
    inclusions.push('Bromo Tengger Semeru National Park entrance fee', 'Bromo 4WD jeep');
  }
  if (bundle.includesIjen) {
    inclusions.push('Ijen Crater entrance fee', 'Ijen local guide', 'Gas mask (provided and sterilized)', 'Mandatory pre-trek health screening at the Bondowoso hotel');
  }
  if (bundle.includesMadakaripura) {
    inclusions.push('Madakaripura Waterfall local guide');
  }
  if (bundle.nodes.some((n) => n.toLowerCase() === 'tumpak sewu')) {
    inclusions.push('Tumpak Sewu Waterfall local guide');
  }
  inclusions.push('Hotel accommodation as specified in the itinerary', 'Meals as specified in the itinerary');
  return inclusions;
}

function buildExclusions(): string[] {
  return [
    'International/domestic flights to and from the tour origin city',
    'Personal travel insurance',
    'Personal expenses, souvenirs, and gratuities',
    'Optional add-on activities not listed in this itinerary (quoted separately)',
    'Bali hotel drop-off beyond the standard drop-off point, if requested (quoted separately)'
  ];
}

export function buildPdfPayload(bundle: PackageBundle): PdfPayload {
  const payload: PdfPayload = {
    id: `pdf-payload:${bundle.package_id}`,
    label: `PDF payload — ${bundle.display_name}`,
    status: 'active',
    confidence: 'inferred',
    source_trace: baseSourceTrace(),
    package_id: bundle.package_id,
    title: `JVTO ${bundle.display_name} (${bundle.duration})`,
    itinerary_days: bundle.itinerary_days,
    inclusions: buildInclusions(bundle),
    exclusions: buildExclusions(),
    price_table: bundle.price,
    terms: {
      deposit: DEPOSIT_TERMS,
      banks: BANK_OPTIONS,
      contact_email: CONTACT_EMAIL
    },
    advisories: {
      mandatory_notes: buildMandatoryNotes(bundle),
      current_advisories: buildCurrentAdvisories(bundle)
    }
  };

  validateObject(`pdf-payload:${bundle.package_id}`, pdfPayloadSchema, payload);
  return payload;
}

export async function buildAllPdfPayloads(): Promise<Array<{ package_id: string; payload: PdfPayload }>> {
  const bundles = await loadPackageBundles();
  return bundles.map((bundle) => ({ package_id: bundle.package_id, payload: buildPdfPayload(bundle) }));
}

async function main() {
  const results = await buildAllPdfPayloads();
  for (const { package_id, payload } of results) {
    const path = `${EXPORT_DIR}/pdf-payload/output/${fileSafePackageId(package_id)}.json`;
    await writeJson(path, payload);
    console.log(`wrote ${path}`);
  }
  console.log(`Generated ${results.length} pdf-payload files.`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
