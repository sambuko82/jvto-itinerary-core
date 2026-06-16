import { GENERATED_DIR } from '../config/paths.js';
import { baseRecord, inventoryGeneratedAt, type InventoryRecord } from '../config/inventory-meta.js';
import { deriveRoutes } from './build-route-derivation.js';

const JVTO_REPO = 'jvto-devteam/jvto-web';
const DETAIL_PATH = 'src/lib/publicContent/generated/packageDetailSnapshots.json';

type ContextType = 'harbor' | 'airport' | 'hotel_area' | 'city_area' | 'staging_area' | 'unknown';
type Phase5Dataset =
  | 'pickup-contexts'
  | 'dropoff-contexts'
  | 'staging-area-contexts'
  | 'location-alias-registry'
  | 'route-node-index';

export interface OperationalContextGapRecord extends InventoryRecord {
  label: string;
  normalized_candidate_id: string;
  seen_in_packages: string[];
  seen_as: string[];
  likely_context_type: ContextType;
  resolution_status: 'pending_phase5';
  recommended_phase5_dataset: Phase5Dataset;
}

// Keyword-based generic role detection (NOT a destination list).
function classify(label: string): ContextType {
  const l = label.toLowerCase();
  if (/airport/.test(l)) return 'airport'; // before harbor: "airport" contains "port"
  if (/harbor|harbour|\bport\b|ferry|gilimanuk|ketapang/.test(l)) return 'harbor';
  if (/hotel/.test(l)) return 'hotel_area';
  if (/transit|staging|transfer|pickup/.test(l)) return 'staging_area';
  if (/city/.test(l)) return 'city_area';
  return 'unknown';
}

const DATASET_BY_TYPE: Record<ContextType, Phase5Dataset> = {
  harbor: 'dropoff-contexts',
  airport: 'pickup-contexts',
  hotel_area: 'pickup-contexts',
  staging_area: 'staging-area-contexts',
  city_area: 'location-alias-registry',
  unknown: 'route-node-index'
};

function normalizedId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export async function buildOperationalContextGapReport(dir: string = GENERATED_DIR): Promise<OperationalContextGapRecord[]> {
  const generated_at = inventoryGeneratedAt();
  const { unresolvedMovements } = await deriveRoutes(dir);

  return unresolvedMovements.map<OperationalContextGapRecord>((m) => {
    const ctype = classify(m.label);
    return {
      ...baseRecord(`opcontext__${normalizedId(m.label)}`, [{ repo: JVTO_REPO, path: DETAIL_PATH, field: m.label }], {
        generated_at,
        confidence: 'low',
        status: 'incomplete',
        missing_fields: ['phase5_context_resolution']
      }),
      label: m.label,
      normalized_candidate_id: normalizedId(m.label),
      seen_in_packages: [...m.seenInPackages].sort(),
      seen_as: [...m.seenAs].sort(),
      likely_context_type: ctype,
      resolution_status: 'pending_phase5',
      recommended_phase5_dataset: DATASET_BY_TYPE[ctype]
    };
  });
}
