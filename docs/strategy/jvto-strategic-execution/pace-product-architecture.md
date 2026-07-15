# Pace Product Architecture

Product tiers and rating logic used by page copy, sales, and customer matching. Consumes the
itinerary-day timing fields and the physical/pace/sleep/road/comfort ratings from
`product-truth-schema.md`, and feeds the Trip Reality Card.

## Product Tiers

| Tier | Promise | Hard Rule | Customer Fit | Price Logic |
|---|---|---|---|---|
| Adventure Sprint | Maximum highlights in minimum time | Can include back-to-back early starts if disclosed | Active travelers, short leave, budget-conscious private groups | Lowest private-tier price |
| Balanced Explorer | Strong highlights with controlled fatigue | No more than one heavy activity in a 24-hour block unless customer confirms | First-time hikers, couples, small groups | Mid-tier |
| Comfort Volcano Journey | Safer pace, better rest, better hotels | Minimum one recovery window after midnight activity | Families, 40+, honeymoon, premium travelers | Premium margin |

## Rating Formula

Physical Rating:
- 1 = mostly vehicle/viewpoint
- 2 = light walking under 1 hour
- 3 = moderate hiking or stairs, 1-3 hours
- 4 = demanding hike, uneven terrain, 3-5 hours
- 5 = strenuous hike, high fatigue, technical terrain, or health-sensitive route

Pace Rating:
- 1 = one core activity per day
- 2 = two light activities per day
- 3 = one core activity plus transfer
- 4 = two major activities or long transfer
- 5 = two major activities plus midnight/early departure or heavy transfer

Sleep Disruption Rating:
- 1 = normal hotel sleep
- 2 = one early wake-up after 05:00
- 3 = wake-up before 04:00 once
- 4 = wake-up before 02:00 once
- 5 = midnight departure or two disrupted nights

Road Time Rating:
- 1 = under 2 hours
- 2 = 2-4 hours
- 3 = 4-6 hours
- 4 = 6-8 hours
- 5 = over 8 hours or rough road plus activity

Comfort Rating:
- 1 = basic transit standard
- 2 = simple local guesthouse
- 3 = standard adventure hotel
- 4 = best practical hotel for the route
- 5 = upgraded room, separate guide/driver, extra rest window, and comfort transport

## Customer Matching Rule

Use Adventure Sprint only when the customer confirms:
- They accept limited sleep.
- They accept back-to-back activities.
- They prioritize coverage over rest.

Use Balanced Explorer when the customer says:
- First time to East Java.
- Wants Bromo and Ijen without feeling rushed.
- Has average fitness.

Use Comfort Volcano Journey when the customer says:
- Family, honeymoon, age 40+, or health sensitivity.
- Wants better rest or better hotel.
- Is willing to pay for comfort and lower friction.

Never recommend a Sleep Disruption 5/5 product to a family, older traveler, or customer with respiratory/knee concerns without written confirmation and a slower alternative.
