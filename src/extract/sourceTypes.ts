export interface ExtractedSourceData {
  packages: unknown[];
  routes: unknown[];
  destinations: unknown[];
  logistics: unknown[];
  costs: unknown[];
  notes: string[];
}

export const emptyExtractedSourceData = (): ExtractedSourceData => ({
  packages: [],
  routes: [],
  destinations: [],
  logistics: [],
  costs: [],
  notes: []
});
