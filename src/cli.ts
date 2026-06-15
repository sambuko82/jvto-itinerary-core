import { readFile } from 'node:fs/promises';
import { compileGeneratedData } from './compile/index.js';
import { validateGeneratedData } from './validate/validate-generated-data.js';
import { evaluateScenarioFromFile } from './scenario/evaluateScenario.js';
import type { ItineraryScenario } from './domain/itinerary.js';

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
  npm run inspect
  npm run scenario -- samples/customer-scenario-surabaya-bromo-ijen-ketapang.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
