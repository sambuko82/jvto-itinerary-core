import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INPUT_DIR } from '../config/paths.js';
import {
  baseRecord,
  inventoryGeneratedAt,
  type InventoryRecord
} from '../config/inventory-meta.js';

const SCHEMA_REPO = 'jvto-devteam/jvto-web';
const SCHEMA_PATH = 'prisma/schema.prisma';
const SCHEMA_SNAPSHOT = resolve(INPUT_DIR, 'jvto-web/schema.prisma');

// Field-name substrings that indicate customer/staff PII (case-insensitive).
const PII_FIELD_PATTERNS = [
  'name', 'email', 'phone', 'passport', 'password', 'token', 'whatsapp', 'wa_',
  'photo', 'booking_code', 'customer', 'account_number', 'plate_no', 'dial_code',
  'attachment', 'reference', 'profile'
];

const DOMAIN_TAGS: Array<{ tag: string; patterns: string[] }> = [
  { tag: 'package', patterns: ['package'] },
  { tag: 'itinerary', patterns: ['itinerary'] },
  { tag: 'destination', patterns: ['destination'] },
  { tag: 'hotel', patterns: ['hotel', 'room'] },
  { tag: 'vehicle', patterns: ['vehicle', 'car'] },
  { tag: 'crew', patterns: ['crew'] },
  { tag: 'cost', patterns: ['price', 'rate', 'cost', 'expense', 'finance', 'profit'] },
  { tag: 'booking', patterns: ['booking'] },
  { tag: 'meal', patterns: ['meal', 'breakfast', 'lunch', 'dinner'] },
  { tag: 'route', patterns: ['route'] },
  { tag: 'activity', patterns: ['activity', 'activities'] }
];

export interface SchemaInventoryRecord extends InventoryRecord {
  model_name: string;
  table_map: string | null;
  field_count: number;
  field_names: string[];
  domain_tags: string[];
  pii_class: 'restricted' | 'open';
  pii_fields: string[];
  excluded_from_extraction: boolean;
}

interface ParsedModel {
  name: string;
  tableMap: string | null;
  fields: string[];
}

export function parsePrismaModels(schema: string): ParsedModel[] {
  const lines = schema.split(/\r?\n/);
  const models: ParsedModel[] = [];
  let current: ParsedModel | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!current) {
      const m = line.match(/^model\s+(\w+)\s*\{/);
      if (m) current = { name: m[1], tableMap: null, fields: [] };
      continue;
    }
    if (line === '}') {
      models.push(current);
      current = null;
      continue;
    }
    if (line === '' || line.startsWith('//')) continue;
    const mapMatch = line.match(/^@@map\("([^"]+)"\)/);
    if (mapMatch) {
      current.tableMap = mapMatch[1];
      continue;
    }
    if (line.startsWith('@@')) continue;
    // field line: `<name> <Type> ...`
    const fieldMatch = line.match(/^(\w+)\s+\S+/);
    if (fieldMatch) current.fields.push(fieldMatch[1]);
  }
  return models;
}

function domainTags(name: string, fields: string[]): string[] {
  const hay = (name + ' ' + fields.join(' ')).toLowerCase();
  return DOMAIN_TAGS.filter((d) => d.patterns.some((p) => hay.includes(p))).map((d) => d.tag);
}

function piiFields(fields: string[]): string[] {
  return fields.filter((f) => {
    const lf = f.toLowerCase();
    return PII_FIELD_PATTERNS.some((p) => lf.includes(p));
  });
}

export function buildSchemaInventory(): SchemaInventoryRecord[] {
  const schema = readFileSync(SCHEMA_SNAPSHOT, 'utf8');
  const generated_at = inventoryGeneratedAt();
  const models = parsePrismaModels(schema);

  return models
    .map<SchemaInventoryRecord>((model) => {
      const pii = piiFields(model.fields);
      const restricted = pii.length > 0;
      const missing_fields: string[] = model.fields.length === 0 ? ['field_names'] : [];

      return {
        ...baseRecord(`model__${model.name}`, [{ repo: SCHEMA_REPO, path: SCHEMA_PATH, field: model.name }], {
          generated_at,
          confidence: 'high',
          status: model.fields.length === 0 ? 'incomplete' : 'active',
          missing_fields
        }),
        model_name: model.name,
        table_map: model.tableMap,
        field_count: model.fields.length,
        field_names: model.fields,
        domain_tags: domainTags(model.name, model.fields),
        pii_class: restricted ? 'restricted' : 'open',
        pii_fields: pii,
        excluded_from_extraction: restricted
      };
    })
    .sort((a, b) => a.model_name.localeCompare(b.model_name));
}
