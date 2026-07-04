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
src/scenario/  -> feasibility evaluator CLI (evaluateScenario) — matches an
                  itinerary request against the fixed-package + route rules
src/tools/     -> operational scripts, e.g. intelligence-check (dataset
                  completeness/freshness check, run independent of compile)
generated/     -> reusable datasets, numbered 01-28. Only 01-15 and 28 are
                  actually written and validated by the compile pipeline
                  (src/compile/index.ts, src/validate/validate-generated-data.ts
                  — see npm run compile / validate). 16-27 are static/imported
                  fixtures (their own source_trace, e.g. llm_wiki package
                  pricing, backoffice masters) with no builder or validation
                  path yet — they do not regenerate and can silently go stale;
                  treat them as manually-maintained until that gap is closed.
generated/itinerary-intelligence/agent-contract/
               -> agent-safe operational contract layer (standard route
                  truth, route-validation rules, instant-book gating).
                  Downstream consumer: jvto-whatsapp-agent-runtime.
exports/       -> consumer-ready payloads: page-payload, pdf-payload,
                  whatsapp-payload, internal-ops-payload, ai-context-pack
                  (5 targets; each has a working sample generator via
                  build-export-payloads.ts as of the 2026-07 consolidation —
                  single sample per target today, per-package generation for
                  whatsapp/pdf is tracked separately)
samples/       -> customer scenario examples
itinerary-builder/
               -> Next.js 14 wizard app (consumer of generated/ datasets,
                  not part of the compile pipeline itself)
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
