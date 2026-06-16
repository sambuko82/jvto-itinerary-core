import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INPUT_DIR } from '../config/paths.js';
import {
  baseRecord,
  inventoryGeneratedAt,
  type InventoryRecord
} from '../config/inventory-meta.js';

const BO_REPO = 'jvto-devteam/new-backoffice';
const ROUTES_PATH = 'routes/data.php';
const ROUTES_SNAPSHOT = resolve(INPUT_DIR, 'new-backoffice/routes-data.php');
const CONTROLLERS_INDEX = resolve(INPUT_DIR, 'new-backoffice/export-controllers.index.json');

// Controllers whose endpoints expose customer/staff PII (restricted, excluded from extraction).
const RESTRICTED_CONTROLLERS = new Set([
  'ExportDataCustomer',
  'ExportDataBookings',
  'ExportDataDiscount',
  'ExportDataAllController'
]);
// Specific handlers that are restricted even if their controller is otherwise open.
const RESTRICTED_HANDLERS = new Set(['ExportDataCrew::crewMember']);

interface ControllerIndex {
  controllers: Record<string, { file: string; handlers: Record<string, string> }>;
}

export interface EndpointInventoryRecord extends InventoryRecord {
  method: string;
  path: string;
  group: string | null;
  controller: string;
  handler: string;
  returns: string | null;
  pii_class: 'restricted' | 'open';
  excluded_from_extraction: boolean;
}

interface ParsedEndpoint {
  method: string;
  path: string;
  group: string | null;
  controller: string;
  handler: string;
}

export function parseExportRoutes(php: string): ParsedEndpoint[] {
  const lines = php.split(/\r?\n/);
  const prefixStack: string[] = [];
  const endpoints: ParsedEndpoint[] = [];

  for (const raw of lines) {
    const line = raw.trim();

    const prefixOpen = line.match(/Route::prefix\('([^']+)'\)->group\(/);
    if (prefixOpen) {
      prefixStack.push(prefixOpen[1]);
      continue;
    }
    if (/^\}\);/.test(line)) {
      prefixStack.pop();
      continue;
    }
    const get = line.match(/Route::(get|post|put|patch|delete)\('([^']+)',\s*\[(\w+)::class,\s*'(\w+)'\]\)/);
    if (get) {
      const [, method, getPath, controller, handler] = get;
      const fullPath = '/' + [...prefixStack, getPath.replace(/^\//, '')].join('/');
      const group = prefixStack.length > 1 ? prefixStack[prefixStack.length - 1] : null;
      endpoints.push({ method: method.toUpperCase(), path: fullPath, group, controller, handler });
    }
  }
  return endpoints;
}

export function buildExportEndpointInventory(): EndpointInventoryRecord[] {
  const php = readFileSync(ROUTES_SNAPSHOT, 'utf8');
  const generated_at = inventoryGeneratedAt();
  const index = JSON.parse(readFileSync(CONTROLLERS_INDEX, 'utf8')) as ControllerIndex;
  const endpoints = parseExportRoutes(php);

  return endpoints.map<EndpointInventoryRecord>((ep) => {
    const handlerKey = `${ep.controller}::${ep.handler}`;
    const restricted = RESTRICTED_CONTROLLERS.has(ep.controller) || RESTRICTED_HANDLERS.has(handlerKey);
    const ctrl = index.controllers[ep.controller];
    const returns = ctrl?.handlers?.[ep.handler] ?? null;
    const controllerFile = ctrl?.file ?? `app/Http/Controllers/ExportData/${ep.controller}.php`;
    const missing_fields: string[] = returns === null ? ['returns'] : [];

    const id = `endpoint__${ep.path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;

    return {
      ...baseRecord(
        id,
        [
          { repo: BO_REPO, path: ROUTES_PATH, field: ep.path },
          { repo: BO_REPO, path: controllerFile, field: handlerKey }
        ],
        { generated_at, confidence: 'high', status: 'active', missing_fields }
      ),
      method: ep.method,
      path: ep.path,
      group: ep.group,
      controller: ep.controller,
      handler: ep.handler,
      returns,
      pii_class: restricted ? 'restricted' : 'open',
      excluded_from_extraction: restricted
    };
  });
}
