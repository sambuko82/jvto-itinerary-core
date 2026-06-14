import { emptyExtractedSourceData, type ExtractedSourceData } from './sourceTypes.js';

export async function extractBackoffice(): Promise<ExtractedSourceData> {
  // TODO: connect to redacted/aggregate exports from new-backoffice.
  // Expected useful inputs:
  // - booking logistics redacted
  // - booking finance summary
  // - hotel/room/meal rates
  // - vehicle and crew rates
  // - destination activity costs
  const data = emptyExtractedSourceData();
  data.notes.push('new-backoffice extractor placeholder: logistics, costs, hotels, vehicles, crews, activities');
  return data;
}
