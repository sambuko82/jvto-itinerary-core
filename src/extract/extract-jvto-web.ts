import { emptyExtractedSourceData, type ExtractedSourceData } from './sourceTypes.js';

export async function extractJvtoWeb(): Promise<ExtractedSourceData> {
  // TODO: connect to jvto-web route/destination/package source.
  // Expected useful inputs:
  // - prisma/schema.prisma
  // - src/data/**
  // - src/lib/publicContent/**
  // - page/PDF/map generator references
  const data = emptyExtractedSourceData();
  data.notes.push('jvto-web extractor placeholder: route details, destinations, map/PDF/page payload references');
  return data;
}
