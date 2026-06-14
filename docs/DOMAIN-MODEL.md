# Domain Model

## Primary objects

### ItineraryScenario

A real/custom travel case based on pickup, arrival, dropoff, destinations, pax, duration, and constraints.

### PackageTemplate

A standard product sold by JVTO/Klook/TWT/site. It is not the final itinerary.

### RouteLeg

A reusable movement segment between two locations.

### RoadSituationProfile

Road condition pattern applied to route legs: toll road, mountain road, waterfall access road, ferry crossing, night drive, rain-sensitive road, etc.

### DestinationActivityProfile

Activity window, dependency, fatigue, guide/equipment need, and cost triggers for a destination.

### OperationalEvent

Non-destination event that matters operationally: medical check, briefing, jeep handoff, lunch stop, ferry crossing, hotel check-in, equipment distribution.

### MealLogic

Included meals, own-expense stops, takeaway breakfast, dinner before Ijen, packed lunch, hotel breakfast, and timing-sensitive meal rules.

### AccommodationLogic

Hotel area logic, room configuration, rest-time effect, meal availability, and relationship to the next activity.

### CostComponent

Reusable cost component: vehicle day, jeep, ticket, local guide, health check, hotel room, meal, gas mask, ferry, add-on, crew, parking/toll, extra dropoff.

### RecommendationRule

A rule that flags impossible, risky, tiring, inefficient, or better route options.

### VisualMapLayer

Map points, markers, legs, labels, route alternatives, visual warnings, and Mapbox/Leaflet payload structure.

### OutputTemplate

Maps the same itinerary data into customer PDF, website page, quotation, WhatsApp summary, and internal ops sheet.

## Correct flow

```text
Customer request
  → ItineraryScenario
  → Candidate route
  → Route-leg evaluation
  → Destination/activity evaluation
  → Operational-event injection
  → Cost-component mapping
  → Recommendation/warning output
  → PDF/page/map payload
```
