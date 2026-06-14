import { readJson } from '../utils/fs.js';
import { GENERATED_DIR } from '../config/paths.js';
import {
  validateArray,
  pickupContextSchema,
  dropoffContextSchema,
  routeLegSchema,
  costComponentSchema
} from '../schemas/generatedSchemas.js';

export async function validateGeneratedData() {
  validateArray('pickup contexts', pickupContextSchema, await readJson(`${GENERATED_DIR}/01-pickup-contexts.json`));
  validateArray('dropoff contexts', dropoffContextSchema, await readJson(`${GENERATED_DIR}/02-dropoff-contexts.json`));
  validateArray('route leg index', routeLegSchema, await readJson(`${GENERATED_DIR}/04-route-leg-index.json`));
  validateArray('cost components', costComponentSchema, await readJson(`${GENERATED_DIR}/10-cost-components.json`));
  return { ok: true };
}
