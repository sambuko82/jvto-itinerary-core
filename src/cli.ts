import { readFile } from 'node:fs/promises';
import { compileGeneratedData } from './compile/index.js';
import { validateGeneratedData } from './validate/validate-generated-data.js';
import { evaluateScenarioFromFile } from './scenario/evaluateScenario.js';
import type { ItineraryScenario } from './domain/itinerary.js';
import { GENERATED_DIR } from './config/paths.js';
import { writeJson } from './utils/fs.js';
import { buildSourceInventory } from './compile/build-source-inventory.js';
import { buildSchemaInventory } from './compile/build-schema-inventory.js';
import { buildExportEndpointInventory } from './compile/build-export-endpoint-inventory.js';
import { validateItineraryIntelligence } from './validate/validate-itinerary-intelligence.js';
import { buildExtractionManifest } from './compile/build-extraction-manifest.js';
import { buildPackageCatalogIndex } from './compile/build-package-catalog-index.js';
import { buildLocationAliasRegistry } from './compile/build-location-alias-registry.js';
import { buildRouteNodeIndex } from './compile/build-route-node-index.js';
import { buildRouteLegIndexDerived } from './compile/build-route-leg-index-derived.js';
import { buildPackageRouteMapDerived } from './compile/build-package-route-map-derived.js';
import { buildRouteSourceCandidates } from './compile/build-route-source-candidates.js';
import { buildOperationalContextGapReport } from './compile/build-operational-context-gap-report.js';

async function main() {
  const command = process.argv[2];

  if (command === 'compile') {
    const files = await compileGeneratedData();
    console.log(`Compiled ${files.length} output files.`);
    for (const file of files) console.log(`- ${file}`);
    return;
  }

  if (command === 'validate') {
    const result = await validateGeneratedData();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'inventory') {
    // Phase 1 Source Discovery: deterministic inventories from committed input/ snapshots.
    await writeJson(`${GENERATED_DIR}/source-inventory.json`, buildSourceInventory());
    await writeJson(`${GENERATED_DIR}/schema-inventory.json`, buildSchemaInventory());
    await writeJson(`${GENERATED_DIR}/export-endpoint-inventory.json`, buildExportEndpointInventory());
    const report = await validateItineraryIntelligence();
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(`status: ${report.status}`);
    if (report.status !== 'pass') {
      console.error('Phase 1 validation FAILED: critical errors present.');
      process.exit(1);
    }
    return;
  }

  if (command === 'extract') {
    // Phase 2 Extractor Connection: connected, normalized source extracts.
    // Note: the raw backoffice extract carries hotel/vehicle/crew `name` keys, so it is
    // NOT persisted as JSON (PII-key convention). It is consumed in-memory by builders and
    // covered by extract-backoffice.test.ts; the manifest records its connection + counts.
    const { manifest, llmWiki, jvtoWeb } = await buildExtractionManifest();
    await writeJson(`${GENERATED_DIR}/extract-llm-wiki.json`, llmWiki);
    await writeJson(`${GENERATED_DIR}/extract-jvto-web.json`, jvtoWeb);
    await writeJson(`${GENERATED_DIR}/extraction-manifest.json`, manifest);
    console.log(JSON.stringify(manifest.extractors.map((e) => ({ extractor: e.extractor, connected: e.connected, counts: e.record_counts })), null, 2));
    console.log(`source_mode: ${manifest.source_mode} | status: ${manifest.status}`);
    return;
  }

  if (command === 'catalog') {
    // Phase 3 Package + Location Normalization (derived from connected extracts only).
    await writeJson(`${GENERATED_DIR}/package-catalog-index.json`, await buildPackageCatalogIndex());
    await writeJson(`${GENERATED_DIR}/location-alias-registry.json`, await buildLocationAliasRegistry());
    await writeJson(`${GENERATED_DIR}/route-node-index.json`, await buildRouteNodeIndex());
    const report = await validateItineraryIntelligence(GENERATED_DIR, { skipPhase4: true });
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(`status: ${report.status}`);
    if (report.status !== 'pass') {
      console.error('Phase 3 validation FAILED: critical errors present.');
      process.exit(1);
    }
    return;
  }

  if (command === 'routes') {
    // Phase 4 + 4.5: source-backed route candidates, gap report, legs + package route map.
    const rsc = await buildRouteSourceCandidates();
    await writeJson(`${GENERATED_DIR}/route-source-candidates.json`, rsc.candidates);
    await writeJson(`${GENERATED_DIR}/route-source-gap-report.json`, rsc.gaps);
    await writeJson(`${GENERATED_DIR}/route-leg-index.json`, await buildRouteLegIndexDerived());
    await writeJson(`${GENERATED_DIR}/package-route-map.json`, await buildPackageRouteMapDerived());
    await writeJson(`${GENERATED_DIR}/operational-context-gap-report.json`, await buildOperationalContextGapReport());
    const report = await validateItineraryIntelligence();
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(`status: ${report.status}`);
    if (report.status !== 'pass') {
      console.error('Phase 4 validation FAILED: critical errors present.');
      process.exit(1);
    }
    return;
  }

  if (command === 'inspect') {
    const manifest = await readFile('generated/itinerary-intelligence/manifest.json', 'utf8');
    console.log(manifest);
    return;
  }

  if (command === 'scenario') {
    const path = process.argv[3] ?? 'samples/customer-scenario-surabaya-bromo-ijen-ketapang.json';
    const raw = await readFile(path, 'utf8');
    const scenario = JSON.parse(raw) as ItineraryScenario;
    const evaluation = await evaluateScenarioFromFile(scenario);
    console.log(JSON.stringify(evaluation, null, 2));
    return;
  }

  console.log(`Usage:
  npm run compile
  npm run validate
  npm run inventory
  npm run inspect
  npm run scenario -- samples/customer-scenario-surabaya-bromo-ijen-ketapang.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
