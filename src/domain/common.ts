export type Confidence = 'verified' | 'inferred' | 'manual_seed' | 'needs_review';
export type Status = 'active' | 'draft' | 'needs_review' | 'deprecated';

export interface SourceTrace {
  source: 'llm_wiki' | 'jvto_web' | 'new_backoffice' | 'manual_seed' | 'generated';
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
