import { emptyExtractedSourceData, type ExtractedSourceData } from './sourceTypes.js';

export async function extractLlmWiki(): Promise<ExtractedSourceData> {
  // TODO: connect to local clone or exported snapshots from sambuko82/llm-wiki.
  // Expected useful inputs:
  // - output/products/package-readiness/package-registry.json
  // - output/products/package-readiness/package-itineraries.json
  // - output/products/package-readiness/package-pricing.json
  const data = emptyExtractedSourceData();
  data.notes.push('llm-wiki extractor placeholder: package registry, itinerary, pricing, policy context');
  return data;
}
