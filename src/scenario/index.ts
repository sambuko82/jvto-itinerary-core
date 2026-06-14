export { evaluateScenario } from './evaluateScenario.js';
export { normalizeScenarioInput, canonicalDestination } from './normalizeScenarioInput.js';
export { selectRoute, type RouteSelection } from './selectRoute.js';
export { applyTimeRules, type TimeRuleResult } from './applyTimeRules.js';
export { applyRecommendationRules, type RecommendationResult } from './applyRecommendationRules.js';
export { applyOperationalEvents, type OperationalEventResult } from './applyOperationalEvents.js';
export { mapCostComponents, type CostComponentResult } from './mapCostComponents.js';
export { loadScenarioDatasets, type ScenarioDatasets } from './datasets.js';
export type {
  RawScenarioInput,
  NormalizedScenario,
  NormalizedEndpoint,
  ScenarioEvaluation,
  ScenarioStatus
} from './types.js';
