# Destination Access Status System

Status logic and message templates for the access-dependent features of JVTO products:
Bromo, Ijen (Blue Fire), Tumpak Sewu, Madakaripura, and Papuma. Consumes the conditional
activities from `product-truth-schema.md` and the evidence register (CLAIM-003 Blue Fire,
CLAIM-006 Bromo access). Operational access is already modeled in the pipeline as
`live_condition` fields (`national_park_access`, `waterfall_access_condition`,
`ijen_access_closure_risk`); this system is how that status reaches sales, guides, and customers.

## Status Levels

| Status | Customer Meaning | Operational Meaning | Required Action |
|---|---|---|---|
| Green | Normal operation expected | Standard itinerary can run | Confirm standard itinerary |
| Yellow | Main route open, feature not guaranteed | Access may change due to weather, gas, road, crowd, authority rule | Send H-7/H-3/H-1 caveat and Plan B |
| Orange | Major promised feature is unavailable or materially uncertain | Product value changes | Offer written options: continue with Plan B, reschedule, upgrade/downgrade, or approved compensation |
| Red | Destination closed or unsafe | Do not operate that activity | Activate force majeure or replacement route |

## Source Hierarchy

1. Official authority instruction or closure notice.
2. On-site authorized officer instruction.
3. JVTO operations field confirmation.
4. Trusted local partner confirmation.
5. Public website or social update.

If sources conflict, use the most restrictive customer-safe status until operations confirms otherwise.

## Message Templates

### H-7 Access Update

Subject: JVTO Access Update - [Destination] - [Trip Date]

Current status: [Green/Yellow/Orange/Red]

Your private trip is currently planned to run as described. Some volcano and waterfall features can change due to weather, gas, road, or local authority instructions. If this affects your main experience, we will send written options before the activity whenever operationally possible.

### H-3 Conditional Feature Update

Subject: JVTO Access Update - [Destination] - 3 Days Before Trip

Current status: [Green/Yellow/Orange/Red]

[Feature] is [available / conditional / unavailable]. If access changes, your approved Plan B is: [Plan B]. Your options are: continue with Plan B, request reschedule subject to availability, or ask our team to review the approved compensation rule for this case.

### H-1 Final Briefing

Subject: JVTO Final Access Briefing - [Destination]

Current status: [Green/Yellow/Orange/Red]

Your guide will brief you again before departure. Final access can still be decided on-site by authorized officers. Safety instructions from the guide and local officers must be followed.

### Real-Time Change Message

Important update: [Feature] status changed to [Orange/Red] at [time]. Reason: [reason]. Your trip will now follow this approved option: [option]. Reply `1` to continue, `2` for reschedule discussion, or `3` for support call.

## Destination Access Log Fields

| Field | Required |
|---|---:|
| log_id | yes |
| destination | yes |
| feature | yes |
| status | yes |
| source_type | yes |
| source_location | yes |
| checked_at | yes |
| checked_by | yes |
| customer_message_sent | yes |
| affected_booking_ids | yes, if active booking exists |
| plan_b_activated | yes, if status Orange or Red |
| follow_up_required | yes |

## Acceptance

No active trip with Yellow, Orange, or Red status proceeds without a logged customer message and guide briefing note.
