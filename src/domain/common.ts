export type Confidence = 'verified' | 'inferred' | 'manual_seed' | 'needs_review';
export type Status = 'active' | 'draft' | 'needs_review' | 'deprecated';

export interface SourceTrace {
  source: 'llm_wiki' | 'jvto_web' | 'new_backoffice' | 'manual_seed' | 'generated' | 'tomtom';
  ref: string;
  field?: string;
  confidence?: Confidence;
}

export interface BaseEntity {
  id: string;
  label: string;
  status: Status;
  confidence: Confidence;
  source_trace: SourceTrace[];
}

/**
 * Aggregated, PII-free operational evidence attached to a generated entity when
 * new-backoffice extract data backs it (sample counts, observed rates, buckets).
 * Never contains a `name` key (blocked by the PII validator).
 */
export type BackofficeObserved = Record<string, unknown>;
