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
