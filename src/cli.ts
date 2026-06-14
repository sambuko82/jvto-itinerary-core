import { readFile } from 'node:fs/promises';
import { compileGeneratedData } from './compile/index.js';
import { validateGeneratedData } from './validate/validate-generated-data.js';
import { evaluateScenario } from './scenario/index.js';
import type { RawScenarioInput } from './scenario/types.js';

const DEFAULT_SCENARIO = 'samples/customer-scenario-surabaya-airport-late-bromo-ijen-ketapang.json';

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
    const path = process.argv[3] ?? DEFAULT_SCENARIO;
    const raw = JSON.parse(await readFile(path, 'utf8')) as RawScenarioInput;
    const evaluation = await evaluateScenario(raw);
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
