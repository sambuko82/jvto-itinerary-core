# Architecture

## High-level architecture

```text
sambuko82/llm-wiki
        │
        ▼
jvto-devteam/jvto-web       jvto-devteam/new-backoffice
        │                         │
        └───────────┬─────────────┘
                    ▼
          jvto-itinerary-core
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
  generated JSON   page payload  PDF payload
```

## Repository responsibility

`jvto-itinerary-core` owns the generated intelligence layer. It does not own raw operational data, PII, or legacy application code.

## Internal layers

```text
contracts/     -> rules for source, entity, output, PII, and costs
input/         -> local source snapshots or exports; never raw PII by default
seed/          -> controlled manual override data for missing route/cost/logic details
src/extract/   -> source readers
src/compile/   -> generated intelligence builders
src/validate/  -> schema/data validation
generated/     -> compiled reusable datasets
exports/       -> consumer-ready payloads
samples/       -> customer scenario examples
```

## Data contract rule

Every generated object should contain:

```text
id
label/name
source_trace
confidence
status
last_reviewed_at, if manually curated
```

## Why generated JSON first

Generated JSON is simple, inspectable, versionable, and can be consumed directly by website, scripts, PDF generators, or future APIs.
