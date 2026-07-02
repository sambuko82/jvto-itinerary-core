import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function flattenLegacyRouteLegGroups(data: unknown): unknown {
  if (!Array.isArray(data)) return data;
  return data.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [entry];
    const group = entry as Record<string, unknown>;
    return Array.isArray(group.legs) ? group.legs : [entry];
  });
}

export async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf8');
  const data = JSON.parse(raw) as unknown;
  return (path.endsWith('04-route-leg-index.json') ? flattenLegacyRouteLegGroups(data) : data) as T;
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}
