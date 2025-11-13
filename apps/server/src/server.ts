import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';

interface RequestContext {}

type AsyncHandler = (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => Promise<void>;

export interface CreateServerOptions {
  context?: RequestContext;
}

/**
 * Creates the HTTP server used by the backend app. Additional routes will be
 * wired in future phases; for Phase 3.1 we only need a health probe.
 */
export function createAppServer(options: CreateServerOptions = {}) {
  const ctx: RequestContext = options.context ?? {};

  return http.createServer(async (req, res) => {
    try {
      await handleIncomingRequest(req, res, ctx);
    } catch (error) {
      console.error('[server] unhandled error', error);
      sendJson(res, 500, { error: 'INTERNAL_ERROR' });
    }
  });
}

export async function handleIncomingRequest(req: IncomingMessage, res: ServerResponse, ctx: RequestContext) {
  const method = req.method ?? 'GET';
  const parsedUrl = parseRequestUrl(req);

  if (method === 'GET' && parsedUrl.pathname === '/api/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'NOT_FOUND' });
}

function parseRequestUrl(req: IncomingMessage) {
  const origin = `http://${req.headers.host ?? 'localhost'}`;
  return new URL(req.url ?? '/', origin);
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}
