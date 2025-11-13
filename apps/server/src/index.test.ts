import { describe, expect, it } from 'vitest';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { handleIncomingRequest } from './server';

describe('server bootstrap', () => {
  it('responds to /api/health with an ok payload', async () => {
    const req = createMockRequest('GET', '/api/health');
    const res = new MockResponse();

    await handleIncomingRequest(req, res as unknown as ServerResponse, {});

    expect(res.statusCode).toBe(200);
    expect(res.getBody()).toEqual({ ok: true });
    expect(res.headers['content-type']).toBe('application/json');
  });
});

function createMockRequest(method: string, path: string) {
  const readable = new Readable({
    read() {
      this.push(null);
    },
  }) as IncomingMessage;

  readable.method = method;
  readable.url = path;
  readable.headers = { host: 'test.local' } as IncomingHttpHeaders;

  return readable;
}

class MockResponse {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = '';
  ended = false;

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  end(chunk?: unknown) {
    if (typeof chunk === 'string') {
      this.body = chunk;
    } else if (Buffer.isBuffer(chunk)) {
      this.body = chunk.toString('utf8');
    } else if (chunk === undefined || chunk === null) {
      this.body = '';
    } else {
      this.body = String(chunk);
    }
    this.ended = true;
  }

  getBody() {
    if (!this.body) return {};
    return JSON.parse(this.body);
  }
}
