import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { INPUT_DIR } from '../config/paths.js';
import { writeText } from '../utils/fs.js';

/**
 * ONLINE refresh (manual): pull PII-free source-structure snapshots from the three
 * GitHub repos into input/ so the deterministic Phase 1 inventory compile stays
 * offline and reproducible. Requires an authenticated `gh` CLI.
 *
 * This does NOT fetch booking/customer data — only schema/route/package-readiness
 * structure files. Run: `npm run refresh:snapshots`.
 */

const RAW_SNAPSHOTS: Array<{ repo: string; path: string; out: string; optional?: boolean }> = [
  { repo: 'sambuko82/llm-wiki', path: 'output/products/package-readiness/_manifest.json', out: 'llm-wiki/package-readiness/_manifest.json' },
  { repo: 'sambuko82/llm-wiki', path: 'output/products/package-readiness/booking-compatibility.json', out: 'llm-wiki/package-readiness/booking-compatibility.json' },
  { repo: 'sambuko82/llm-wiki', path: 'output/products/package-readiness/gap-report.json', out: 'llm-wiki/package-readiness/gap-report.json' },
  { repo: 'sambuko82/llm-wiki', path: 'output/products/package-readiness/package-itineraries.json', out: 'llm-wiki/package-readiness/package-itineraries.json' },
  { repo: 'sambuko82/llm-wiki', path: 'output/products/package-readiness/package-pricing.json', out: 'llm-wiki/package-readiness/package-pricing.json' },
  { repo: 'sambuko82/llm-wiki', path: 'output/products/package-readiness/package-registry.json', out: 'llm-wiki/package-readiness/package-registry.json' },
  { repo: 'sambuko82/llm-wiki', path: 'output/products/package-readiness/package-operational-days.json', out: 'llm-wiki/package-readiness/package-operational-days.json' },
  { repo: 'jvto-devteam/jvto-web', path: 'prisma/schema.prisma', out: 'jvto-web/schema.prisma' },
  {
    repo: 'jvto-devteam/jvto-web',
    path: 'src/lib/publicContent/generated/packageDetailSnapshots.json',
    out: 'jvto-web/publicContent/generated/packageDetailSnapshots.json',
    optional: true
  },
  {
    repo: 'jvto-devteam/jvto-web',
    path: 'src/lib/publicContent/generated/destinationDetailSnapshots.json',
    out: 'jvto-web/publicContent/generated/destinationDetailSnapshots.json',
    optional: true
  },
  {
    repo: 'jvto-devteam/jvto-web',
    path: 'src/lib/publicContent/generated/packageActivitySnapshots.json',
    out: 'jvto-web/publicContent/generated/packageActivitySnapshots.json'
  },
  { repo: 'jvto-devteam/new-backoffice', path: 'routes/data.php', out: 'new-backoffice/routes-data.php' }
];

function ghContent(repo: string, path: string): string {
  const b64 = execFileSync('gh', ['api', `repos/${repo}/contents/${path}`, '--jq', '.content'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  return Buffer.from(b64.replace(/\n/g, ''), 'base64').toString('utf8');
}

async function main(): Promise<void> {
  for (const s of RAW_SNAPSHOTS) {
    const out = resolve(INPUT_DIR, s.out);
    mkdirSync(dirname(out), { recursive: true });
    try {
      const content = ghContent(s.repo, s.path);
      await writeText(out, content);
      console.log(`refreshed ${s.out} (${content.length} bytes) <- ${s.repo}/${s.path}`);
    } catch (err) {
      if (s.optional) {
        console.warn(`optional snapshot not available, skipped: ${s.repo}/${s.path}`);
      } else {
        throw err;
      }
    }
  }
  console.log(
    '\nNote: input/source-snapshot-manifest.json, lib-packages.index.json, and ' +
      'export-controllers.index.json are curated index snapshots — update snapshot_generated_at ' +
      'and any new files/models/endpoints there when the upstream surface changes.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
