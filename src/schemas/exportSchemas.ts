import { z } from 'zod';

// Local copy of the BaseEntity contract (id/label/status/confidence/source_trace)
// used by generatedSchemas.ts, kept separate here since exports/ payloads are a
// different generated-object family (see src/domain/common.ts BaseEntity).
const sourceTraceSchema = z.object({
  source: z.enum(['llm_wiki', 'jvto_web', 'new_backoffice', 'manual_seed', 'generated', 'tomtom']),
  ref: z.string(),
  field: z.string().optional(),
  confidence: z.enum(['verified', 'inferred', 'manual_seed', 'needs_review']).optional()
});

const baseContractSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(['active', 'draft', 'needs_review', 'deprecated']),
  confidence: z.enum(['verified', 'inferred', 'manual_seed', 'needs_review']),
  source_trace: z.array(sourceTraceSchema).min(1)
});

const priceBandSchema = z.object({
  min_pax: z.number().int().positive(),
  max_pax: z.number().int().positive().nullable(),
  idr_per_person: z.number().int().positive()
});

const priceContextSchema = z.object({
  currency: z.literal('IDR'),
  origin: z.string().min(1),
  ferry_included: z.boolean(),
  bands: z.array(priceBandSchema).min(1)
});

export const whatsappPayloadSchema = baseContractSchema.extend({
  package_id: z.string().min(1),
  display_name: z.string().min(1),
  duration: z.string().regex(/^\d+D\d+N$/i),
  price_bands: priceContextSchema,
  route_summary: z.array(z.string().min(1)).min(2),
  highlights: z.array(z.string().min(1)).max(5),
  mandatory_notes: z.array(z.string().min(1)),
  current_advisories: z.array(z.string().min(1)),
  instant_book_eligible: z.boolean(),
  gated_reason: z.string().nullable(),
  wa_message_en: z.string().min(1).max(900)
});

export type WhatsappPayload = z.infer<typeof whatsappPayloadSchema>;

const itinerarySegmentSchema = z.object({
  time_window: z.string().min(1),
  activity: z.string().min(1),
  location: z.string().min(1),
  notes: z.string()
});

const itineraryDaySchema = z.object({
  day: z.number().int().positive(),
  segments: z.array(itinerarySegmentSchema).min(1)
});

const pdfTermsSchema = z.object({
  deposit: z.string().min(1),
  banks: z.array(z.string().min(1)).min(1),
  contact_email: z.string().email()
});

const pdfAdvisoriesSchema = z.object({
  mandatory_notes: z.array(z.string().min(1)),
  current_advisories: z.array(z.string().min(1))
});

export const pdfPayloadSchema = baseContractSchema.extend({
  package_id: z.string().min(1),
  title: z.string().min(1),
  itinerary_days: z.array(itineraryDaySchema).min(1),
  inclusions: z.array(z.string().min(1)).min(1),
  exclusions: z.array(z.string().min(1)).min(1),
  price_table: priceContextSchema,
  terms: pdfTermsSchema,
  advisories: pdfAdvisoriesSchema
});

export type PdfPayload = z.infer<typeof pdfPayloadSchema>;
