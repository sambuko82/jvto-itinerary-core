// Internal HTTP wrapper around evaluateScenario (E4 of the consolidation plan).
//
// POST /evaluate  - body: an ItineraryScenario JSON (see samples/*.json).
// GET  /health     - liveness + dataset load check.
//
// Node's built-in node:http only - no new dependencies. Datasets are loaded
// once at boot (loadDatasets is not cheap enough to run per-request) and
// reused for every request; this process is stateless otherwise.
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadDatasets, evaluateScenario, type ScenarioEvaluation } from '../scenario/evaluateScenario.js';
import { evaluateCancellation, type CancellationInput } from '../scenario/evaluateCancellation.js';
import { loadDecisionMatrix, type DecisionMatrix } from '../scenario/cancellationPolicy.js';
import { itineraryScenarioSchema } from '../domain/itinerary.js';
import { readJson } from '../utils/fs.js';
import { GENERATED_DIR } from '../config/paths.js';

const DEFAULT_PORT = 4174;

type Datasets = Awaited<ReturnType<typeof loadDatasets>>;

interface ManifestVersion {
  schema_version: number;
  generated_at: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectPromise);
  });
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

// Statuses evaluateScenario can never satisfy given the stated constraints
// (too few days / an overnight-impossible multi-stop plan). This is distinct
// from `needs_manual_review`, which means "a human must look at this", not
// "this itinerary cannot work" - so only `not_recommended` maps to 422.
const INFEASIBLE_STATUSES = new Set<ScenarioEvaluation['status']>(['not_recommended']);

export function buildEvaluateResponse(
  evaluation: ScenarioEvaluation,
  datasetManifestVersion: string
): { statusCode: number; body: Record<string, unknown> } {
  const statusCode = INFEASIBLE_STATUSES.has(evaluation.status) ? 422 : 200;
  return {
    statusCode,
    body: {
      ...evaluation,
      meta: {
        dataset_manifest_version: datasetManifestVersion,
        evaluated_at: new Date().toISOString()
      }
    }
  };
}

export async function createScenarioServer(): Promise<Server> {
  const datasets: Datasets = await loadDatasets();

  let datasetManifestVersion = 'unknown';
  try {
    const manifest = await readJson<ManifestVersion>(`${GENERATED_DIR}/manifest.json`);
    datasetManifestVersion = `${manifest.schema_version}:${manifest.generated_at}`;
  } catch (err) {
    console.error('[scenario-server] failed to read dataset manifest version:', err);
  }

  // Cancellation decision matrix is loaded once at boot; the endpoint is optional
  // and stays disabled (503) if the snapshot is missing.
  let cancellationMatrix: DecisionMatrix | null = null;
  try {
    cancellationMatrix = loadDecisionMatrix();
  } catch (err) {
    console.error('[scenario-server] cancellation decision matrix unavailable:', err);
  }

  const server = createHttpServer((req, res) => {
    void handleRequest(req, res, datasets, datasetManifestVersion, cancellationMatrix);
  });

  return server;
}

function isCancellationInput(body: unknown): body is CancellationInput {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.booking === 'object' &&
    b.booking !== null &&
    typeof b.requestType === 'string' &&
    typeof b.cause === 'string' &&
    typeof b.submittedAt === 'string'
  );
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  datasets: Datasets,
  datasetManifestVersion: string,
  cancellationMatrix: DecisionMatrix | null
): Promise<void> {
  try {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    if (method === 'GET' && url === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        datasets_loaded: true,
        package_count: datasets.packageRoutes.length
      });
      return;
    }

    if (method === 'POST' && url === '/evaluate') {
      const raw = await readBody(req);
      let parsedBody: unknown;
      try {
        parsedBody = raw.length ? JSON.parse(raw) : undefined;
      } catch {
        sendJson(res, 400, {
          error: 'invalid_json',
          message: 'Request body is not valid JSON.'
        });
        return;
      }

      const result = itineraryScenarioSchema.safeParse(parsedBody);
      if (!result.success) {
        sendJson(res, 400, {
          error: 'invalid_scenario',
          message: 'Request body does not match the ItineraryScenario schema.',
          issues: result.error.issues
        });
        return;
      }

      const evaluation = evaluateScenario(result.data, datasets);
      const { statusCode, body } = buildEvaluateResponse(evaluation, datasetManifestVersion);
      sendJson(res, statusCode, body);
      return;
    }

    if (method === 'POST' && url === '/evaluate-cancellation') {
      if (!cancellationMatrix) {
        sendJson(res, 503, {
          error: 'cancellation_matrix_unavailable',
          message: 'Cancellation decision matrix snapshot is not loaded.'
        });
        return;
      }
      const raw = await readBody(req);
      let parsedBody: unknown;
      try {
        parsedBody = raw.length ? JSON.parse(raw) : undefined;
      } catch {
        sendJson(res, 400, { error: 'invalid_json', message: 'Request body is not valid JSON.' });
        return;
      }
      if (!isCancellationInput(parsedBody)) {
        sendJson(res, 400, {
          error: 'invalid_cancellation_input',
          message: 'Body must include booking, requestType, cause, and submittedAt.'
        });
        return;
      }
      const decision = evaluateCancellation(parsedBody, cancellationMatrix);
      sendJson(res, 200, {
        ...decision,
        meta: { policy_version: cancellationMatrix.policy_version, evaluated_at: new Date().toISOString() }
      });
      return;
    }

    sendJson(res, 404, { error: 'not_found', message: `No route for ${method} ${url}` });
  } catch (err) {
    // Never leak stack traces / internals to the client; log server-side only.
    console.error('[scenario-server] unexpected error handling request:', err);
    sendJson(res, 500, { error: 'internal_error', message: 'Unexpected server error.' });
  }
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const server = await createScenarioServer();
  server.listen(port, () => {
    console.log(`[scenario-server] listening on port ${port}`);
  });
}

// Only auto-start when this file is run directly (npm run scenario:serve),
// not when imported by the test file.
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error('[scenario-server] failed to start:', err);
    process.exit(1);
  });
}
