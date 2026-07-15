# KPI Dashboard Spec

Metric definitions, weekly operating rhythm, and 30/60/90-day pass gates. Consumes all prior
workstreams. Dashboard host: Google Looker Studio or a spreadsheet dashboard.

## Trust KPIs

| KPI | Formula | Target | Cadence | Owner |
|---|---|---:|---|---|
| Channel sync pass rate | passed checks / total active channel checks | 100% for promoted products | weekly | Product |
| Unexpected cost complaints | complaints mentioning surprise cost / departures | 0 | monthly | Operations |
| Late access communication incidents | access changes sent after customer should reasonably know / affected trips | 0 | monthly | Operations |
| Review data freshness | channels with review count checked within 30 days / channels using review count | 100% | monthly | Marketing |

## Product KPIs

| KPI | Formula | Target | Cadence | Owner |
|---|---|---:|---|---|
| Pace expectation match | survey Q3 average | 4.5/5 | monthly | Product |
| Sleep expectation match | survey Q4 average | 4.3/5 | monthly | Product |
| Hotel rest score | survey Q5 average by hotel | 4.2/5 | monthly | Ops |
| Guide score | weighted guide score | 88/100 | monthly | Guide Lead |

## Growth KPIs

| KPI | Formula | Target | Cadence | Owner |
|---|---|---:|---|---|
| Hero product conversion | bookings / qualified product visitors | establish baseline in first 30 days | weekly | Marketing |
| Source attribution coverage | bookings with source / total bookings | 90% | weekly | Sales |
| Review request completion | review requests sent / completed tours | 95% | weekly | CX |
| Public review rate | public reviews / completed tours | establish baseline, then improve 20% | monthly | CX |

## Governance Rhythm

### Weekly 45-minute execution review

Agenda:

1. Access status issues from the last 7 days.
2. Any product truth mismatch.
3. Customer complaints or low survey scores.
4. Hotel or guide below threshold.
5. Hero product conversion and source attribution.
6. Decisions that require website, voucher, OTA, or template updates.

Output:

- Decision log updated.
- Owners assigned.
- Next-review date set.
- Channel sync checklist rerun for changed products.

## 30-Day Gate: Trust Foundation

Pass only if:

1. Evidence register covers all major public claims.
2. Master Product Database contains the six hero products.
3. Trip Reality Card exists for each hero product.
4. Meal matrix (and entrance-fee status, CLAIM-004) is complete for each hero product.
5. Legal identifier (`PT Java Volcano Rendezvous` / NIB `1102230032918`) is synchronized across priority channels.
6. Destination Access Status System is active for Ijen and Bromo.

## 60-Day Gate: Product And Operations Foundation

Pass only if:

1. Adventure Sprint, Balanced Explorer, and Comfort Volcano Journey rules are approved.
2. Each hero product has physical, pace, sleep, road, and comfort ratings.
3. Hotel scorecard is active for all hotels used in hero products.
4. Guide scorecard is active for all guides assigned to hero products.
5. Post-trip survey captures hotel, guide, sleep, meal, and pace separately.

## 90-Day Gate: Scaled Distribution

Pass only if:

1. Six hero products are channel-ready.
2. At least two external discovery channels are synchronized with website truth.
3. Singapore and Malaysia pages are live or ready for final QA.
4. Hong Kong and Taiwan pages are held until language/service support is verified.
5. Review engine is active and measured.
6. Source attribution covers at least 90% of new bookings.
