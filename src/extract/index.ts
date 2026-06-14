import { extractLlmWiki } from './extract-llm-wiki.js';
import { extractJvtoWeb } from './extract-jvto-web.js';
import { extractBackoffice } from './extract-backoffice.js';

export async function extractAllSources() {
  const [llmWiki, jvtoWeb, backoffice] = await Promise.all([
    extractLlmWiki(),
    extractJvtoWeb(),
    extractBackoffice()
  ]);

  return { llmWiki, jvtoWeb, backoffice };
}
