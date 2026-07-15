# Master Product Database Schema

Field definitions for the external Master Product Database (Google Sheets or Airtable). One
row per sellable product in the Product Table, linked to one row per itinerary day in the
Itinerary Day Table.

Product IDs must reuse the canonical package IDs from
`input/llm-wiki/package-readiness/package-registry.json` — do not invent new slugs. The
convention is `{destinations-in-order}-{duration}`, with a `bali/` prefix for Bali-origin
trips (e.g. `bali/bromo-ijen-3d2n`).

## Product Table

| Field | Type | Required | Rule |
|---|---|---:|---|
| product_id | text | yes | Canonical registry slug, for example `bromo-madakaripura-ijen-3d2n` |
| product_name | text | yes | Customer-facing product name (match registry `title`) |
| status | enum | yes | `draft`, `active`, `paused`, `retired` |
| origin | enum | yes | `surabaya`, `bali` (matches registry `origin`) |
| route_summary | text | yes | Start, major stops, finish |
| duration_days | number | yes | Whole number |
| duration_nights | number | yes | Whole number |
| pickup_points | list | yes | Cities, hotels, airport, station, or `needs_verification` |
| dropoff_points | list | yes | Cities, hotels, airport, harbor, or `needs_verification` |
| legal_entity | text | yes | Canonical legal entity (`PT Java Volcano Rendezvous`) |
| registration_number | text | yes | Canonical NIB or equivalent (`1102230032918`) |
| price_currency | text | yes | `IDR`, `USD`, or active selling currency |
| price_by_pax | table | yes | Per-person tiers copied verbatim from `package-pricing.json` `pax_tiers` — preserve every exact `min_pax`/`max_pax` band (e.g. `bromo-madakaripura-ijen-3d2n` has distinct 6-7, 8-10, 11+ bands). Never collapse or simplify bands, or 8+ groups will be misquoted across channels. |
| deposit_rule | text | yes | Exact deposit and payment rule |
| cancellation_rule | text | yes | Exact customer-facing cancellation rule |
| included_transport | list | yes | Vehicle, jeep, ferry, train, or `not_included` |
| included_accommodation | text | yes | Hotel names/classes and substitute rule |
| included_guides | text | yes | Driver-guide, local guide, separate guide, language |
| included_safety | list | yes | Gas mask, medical screening, briefing, emergency contact |
| included_meals_summary | text | yes | Human-readable summary only; day table is source |
| entrance_fee_status | const | yes | Always `included` — every JVTO package price is all-inclusive of entrance fees and permits for all destinations. Never store or display tariff amounts; no `paid_on_site`/`mixed`/`excluded` values are used. |
| excluded_costs | list | yes | Meals, tips, personal expenses, optional upgrades |
| conditional_activities | list | yes | Blue Fire, waterfalls, viewpoints, access-dependent items |
| plan_b_options | list | yes | Approved alternatives when access changes |
| physical_rating | number | yes | 1-5 |
| pace_rating | number | yes | 1-5 |
| sleep_disruption_rating | number | yes | 1-5 |
| road_time_rating | number | yes | 1-5 |
| comfort_rating | number | yes | 1-5 |
| last_verified_at | date | yes | Date checked against source |
| owner | text | yes | Named team role |
| public_notes | text | no | Customer-facing caveat |
| internal_notes | text | no | Private ops caveat |

## Itinerary Day Table

| Field | Type | Required | Rule |
|---|---|---:|---|
| product_id | text | yes | Links to Product Table |
| day_number | number | yes | Starts at 1 |
| day_title | text | yes | Customer-facing day title |
| pickup_time_window | text | yes | Exact range or `needs_verification` |
| main_activities | list | yes | Ordered activity list |
| driving_time_estimate | text | yes | Use range, not false precision |
| walking_or_hiking_time | text | yes | Use range |
| earliest_wake_time | text | yes | Example `00:00-01:00` |
| expected_sleep_window | text | yes | Example `3-5 hours` |
| breakfast_status | enum | yes | `included`, `own_cost`, `not_applicable`, `needs_verification` |
| lunch_status | enum | yes | `included`, `own_cost`, `not_applicable`, `needs_verification` |
| dinner_status | enum | yes | `included`, `own_cost`, `not_applicable`, `needs_verification` |
| hotel_or_area | text | yes | Exact hotel, area, or class |
| access_risks | list | yes | Closure, weather, gas, road, waterfall access |
| guide_briefing_required | list | yes | Items guide must explain that day |

## Initial Hero Candidate Product IDs

These map to real registry packages. The commercial owner may re-select the final six, but
every ID here exists in `package-registry.json`:

1. `bromo-madakaripura-ijen-3d2n` — 3 Day Bromo, Madakaripura & Ijen Overland from Surabaya to Bali
2. `tumpak-sewu-bromo-ijen-4d3n` — 4 Day Tumpak Sewu, Bromo & Ijen Adventure from Surabaya to Bali
3. `bali/ijen-bromo-madakaripura-3d2n` — 3 Day Ijen, Bromo & Madakaripura from Bali to Surabaya
4. `ijen-papuma-tumpak-sewu-bromo-5d4n` — 5 Day Ijen, Papuma, Tumpak Sewu & Bromo from Surabaya
5. `bromo-1d1n` — 1 Day Bromo Midnight Experience from Surabaya
6. `ijen-2d1n` — 2 Day Ijen Blue Fire Expedition from Surabaya

## Acceptance

Every product has a stable canonical ID (from the registry) before any page, voucher, or
listing is rewritten.
