import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { createScenarioServer } from './scenario-server.js';

const SAMPLES = 'samples';

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = await createScenarioServer();
  await new Promise<void>((resolvePromise) => server.listen(0, resolvePromise));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((err) => (err ? rejectPromise(err) : resolvePromise()));
    });
  }
}

function request(
  baseUrl: string,
  path: string,
  init: { method?: string; body?: string } = {}
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = http.request(
      `${baseUrl}${path}`,
      { method: init.method ?? 'GET', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let body: unknown = raw;
          try {
            body = raw.length ? JSON.parse(raw) : undefined;
          } catch {
            // leave as raw string if not JSON
          }
          resolvePromise({ statusCode: res.statusCode ?? 0, body });
        });
      }
    );
    req.on('error', rejectPromise);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

test('GET /health reports datasets loaded and a package count', async () => {
  await withServer(async (baseUrl) => {
    const { statusCode, body } = await request(baseUrl, '/health');
    assert.equal(statusCode, 200);
    const health = body as { status: string; datasets_loaded: boolean; package_count: number };
    assert.equal(health.status, 'ok');
    assert.equal(health.datasets_loaded, true);
    assert.ok(health.package_count > 0);
  });
});

test('POST /evaluate on a feasible sample returns 200 with a full evaluation + meta', async () => {
  await withServer(async (baseUrl) => {
    const raw = await readFile(`${SAMPLES}/customer-scenario-surabaya-bromo-ijen-ketapang.json`, 'utf8');
    const { statusCode, body } = await request(baseUrl, '/evaluate', { method: 'POST', body: raw });
    assert.equal(statusCode, 200);
    const result = body as Record<string, unknown>;
    assert.ok(Array.isArray(result.recommended_route));
    assert.ok(Array.isArray(result.route_leg_ids));
    assert.ok(Array.isArray(result.warnings));
    assert.ok(Array.isArray(result.cost_components));
    const meta = result.meta as { dataset_manifest_version: string; evaluated_at: string };
    assert.equal(typeof meta.dataset_manifest_version, 'string');
    assert.ok(meta.dataset_manifest_version.length > 0);
    assert.ok(!Number.isNaN(Date.parse(meta.evaluated_at)), 'evaluated_at should be a valid ISO timestamp');
  });
});

test('POST /evaluate on a package-aware sample returns recommended + package_route_id', async () => {
  await withServer(async (baseUrl) => {
    const raw = await readFile(`${SAMPLES}/customer-scenario-package-bromo-ijen-bali-4d3n.json`, 'utf8');
    const { statusCode, body } = await request(baseUrl, '/evaluate', { method: 'POST', body: raw });
    assert.equal(statusCode, 200);
    const result = body as Record<string, unknown>;
    assert.equal(result.status, 'recommended');
    assert.equal(result.package_route_id, 'bromo-ijen-bali-4d3n');
  });
});

test('POST /evaluate on the impossible sample returns 422 with warnings/notes intact', async () => {
  await withServer(async (baseUrl) => {
    const raw = await readFile(`${SAMPLES}/customer-scenario-impossible-late-arrival-early-dropoff.json`, 'utf8');
    const { statusCode, body } = await request(baseUrl, '/evaluate', { method: 'POST', body: raw });
    assert.equal(statusCode, 422);
    const result = body as Record<string, unknown>;
    assert.equal(result.status, 'not_recommended');
    assert.ok(Array.isArray(result.better_route_notes));
    assert.ok((result.meta as Record<string, unknown>).dataset_manifest_version);
  });
});

test('POST /evaluate with malformed JSON returns 400', async () => {
  await withServer(async (baseUrl) => {
    const { statusCode, body } = await request(baseUrl, '/evaluate', {
      method: 'POST',
      body: '{ this is not valid json'
    });
    assert.equal(statusCode, 400);
    const result = body as Record<string, unknown>;
    assert.equal(result.error, 'invalid_json');
  });
});

test('POST /evaluate with an empty body returns 400 with zod issues', async () => {
  await withServer(async (baseUrl) => {
    const { statusCode, body } = await request(baseUrl, '/evaluate', { method: 'POST', body: '' });
    assert.equal(statusCode, 400);
    const result = body as Record<string, unknown>;
    assert.equal(result.error, 'invalid_scenario');
    assert.ok(Array.isArray(result.issues));
  });
});

test('POST /evaluate with a schema-invalid scenario (missing required fields) returns 400', async () => {
  await withServer(async (baseUrl) => {
    const { statusCode, body } = await request(baseUrl, '/evaluate', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' })
    });
    assert.equal(statusCode, 400);
    const result = body as Record<string, unknown>;
    assert.equal(result.error, 'invalid_scenario');
    assert.ok(Array.isArray(result.issues) && (result.issues as unknown[]).length > 0);
  });
});

test('unknown route returns 404', async () => {
  await withServer(async (baseUrl) => {
    const { statusCode } = await request(baseUrl, '/nope');
    assert.equal(statusCode, 404);
  });
});
