import type { MealLogic } from '../domain/operations.js';
import type { BackofficeExtract } from '../extract/sourceTypes.js';
import { backofficeTrace, bumpConfidence, mealLogicObserved } from './backoffice-enrich.js';

export function buildMealLogic(backoffice?: BackofficeExtract): MealLogic[] {
  const meals: MealLogic[] = [
    {
      id: 'dinner_before_ijen',
      label: 'Dinner before Ijen preparation',
      status: 'active',
      confidence: 'manual_seed',
      meal: 'dinner',
      included: 'depends_on_package',
      applies_when: ['overnight before Ijen', 'arrival in Bondowoso or Ijen area before medical check'],
      customer_note: 'Dinner is normally arranged before medical check and Ijen briefing when included in the package.',
      cost_components: ['dinner_bondowoso'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/meal-logic.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'takeaway_breakfast_after_ijen_or_bromo',
      label: 'Takeaway breakfast for early activity',
      status: 'active',
      confidence: 'manual_seed',
      meal: 'breakfast',
      included: 'depends_on_package',
      applies_when: ['early_morning_activity', 'hotel_breakfast_not_available_before_departure'],
      customer_note: 'Breakfast may be served as takeaway due to very early departure.',
      cost_components: ['hotel_breakfast_or_takeaway'],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/meal-logic.yaml', confidence: 'manual_seed' }]
    },
    {
      id: 'lunch_stop_own_expense_long_transfer',
      label: 'Lunch stop at own expense during long transfer',
      status: 'active',
      confidence: 'manual_seed',
      meal: 'lunch',
      included: false,
      applies_when: ['long_transfer_more_than_4_hours', 'lunch_not_included'],
      customer_note: 'Lunch stop can be arranged on the way, at customer\'s own expense unless stated as included.',
      cost_components: [],
      source_trace: [{ source: 'manual_seed', ref: 'seed/manual-overrides/meal-logic.yaml', confidence: 'manual_seed' }]
    }
  ];

  if (!backoffice) return meals;

  for (const meal of meals) {
    const observed = mealLogicObserved(backoffice, meal.id);
    if (!observed) continue;
    meal.confidence = bumpConfidence(meal.confidence);
    meal.source_trace.push(backofficeTrace('meal rates + package meal inclusion (hotels, packages)'));
    meal.backoffice_observed = observed;
  }

  return meals;
}
