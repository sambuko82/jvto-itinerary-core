import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guard: the core must build, test, and run with NO external LLM API key and no
 * paid/hosted model SDK. The itinerary decision is deterministic over generated
 * datasets; an LLM is only ever a dev-time assistant or an optional, disabled-by-
 * default edge adapter — never a build/test/runtime requirement here.
 *
 * This is the single source of truth for that invariant, shared by the test
 * (`no-llm-dependency.test.ts`) and `npm run intelligence:check`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = 'llm-dependency-guard.ts'; // excluded from the source scan (holds the patterns below)

// Paid/hosted LLM provider SDKs that must never become a (dev)dependency.
const FORBIDDEN_DEP =
  /^(openai$|anthropic$|@anthropic-ai\/|langchain|@langchain\/|cohere|cohere-ai|@google\/generative-ai|@google\/genai|google-generativeai|mistralai|@mistralai\/|ollama|replicate|@huggingface\/|@aws-sdk\/client-bedrock|@azure\/openai)/i;
// Provider API-key env vars that would make the system require a paid key.
const FORBIDDEN_ENV =
  /\b(ANTHROPIC_API_KEY|OPENAI_API_KEY|OPENAI_KEY|AZURE_OPENAI_[A-Z_]*KEY|GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_API_KEY|COHERE_API_KEY|MISTRAL_API_KEY|HUGGINGFACE_API_KEY|HF_TOKEN|REPLICATE_API_TOKEN)\b/;
// Direct imports/requires of a model SDK in runtime/build code.
const FORBIDDEN_IMPORT =
  /(?:from\s+|require\(\s*)['"](openai|@anthropic-ai\/[^'"]+|langchain[^'"]*|@langchain\/[^'"]+|cohere-ai|@google\/generative-ai|@google\/genai|mistralai|@mistralai\/[^'"]+|ollama|replicate|@huggingface\/[^'"]+|@aws-sdk\/client-bedrock[^'"]*)['"]/;

export interface LlmGuardResult {
  ok: boolean;
  violations: string[];
  scanned: number;
}

/** Collect shippable runtime/build source: src/**\/*.ts (excluding tests + this file) and scripts/*.mjs. */
function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if ((/\.ts$/.test(name) && !/\.test\.ts$/.test(name) && name !== SELF) || /\.mjs$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

export function checkNoLlmDependency(): LlmGuardResult {
  const violations: string[] = [];

  // 1. No paid/hosted LLM SDK in dependencies or devDependencies.
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const dep of Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) })) {
    if (FORBIDDEN_DEP.test(dep)) violations.push(`package.json depends on an LLM provider SDK: ${dep}`);
  }

  // 2. No provider API-key requirement / model SDK import in runtime/build source.
  const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'scripts'))];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const rel = f.slice(ROOT.length + 1);
    const env = text.match(FORBIDDEN_ENV);
    if (env) violations.push(`${rel}: references a provider API key (${env[0]})`);
    const imp = text.match(FORBIDDEN_IMPORT);
    if (imp) violations.push(`${rel}: imports a model SDK (${imp[1]})`);
  }

  return { ok: violations.length === 0, violations, scanned: files.length };
}
