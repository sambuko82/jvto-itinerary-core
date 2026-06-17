import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNoLlmDependency } from './llm-dependency-guard.js';

// Enforces the project invariant: the core builds, tests, and runs with no
// external LLM API key and no paid/hosted model SDK. If anyone adds an LLM
// provider SDK dependency, a provider API-key requirement, or a model SDK
// import to runtime/build code, this fails — keeping the itinerary decision
// deterministic and keyless.
test('core requires no external LLM API key or model SDK', () => {
  const r = checkNoLlmDependency();
  assert.ok(r.scanned > 0, 'guard scanned no source files — check is not running');
  assert.deepEqual(r.violations, [], `LLM dependency violations found:\n  ${r.violations.join('\n  ')}`);
  assert.equal(r.ok, true);
});
