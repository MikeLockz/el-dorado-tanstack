import { describe, expect, it } from 'vitest';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { RoomRegistry } from './rooms/RoomRegistry';
import { handleIncomingRequest } from './server';

describe('server bootstrap', () => {
  it('responds to /api/health with an ok payload', async () => {
    const req = createMockRequest('GET', '/api/health');
    const res = new MockResponse();

    await handleIncomingRequest(req, res as unknown as ServerResponse, { registry: new RoomRegistry() });

    expect(res.statusCode).toBe(200);
    expect(res.getBody()).toEqual({ ok: true });
    expect(res.headers['content-type']).toBe('application/json');
  });

  it('creates rooms via POST /api/create-room', async () => {
    const registry = new RoomRegistry();
    const req = createMockRequest('POST', '/api/create-room', {
      displayName: 'Tester',
      avatarSeed: 'seed',
      color: '#123456',
    });
    const res = new MockResponse();

    await handleIncomingRequest(req, res as unknown as ServerResponse, { registry });

    const body = res.getBody();
    expect(res.statusCode).toBe(201);
    expect(body.gameId).toBeTruthy();
    expect(body.joinCode).toHaveLength(6);
    expect(body.playerToken).toBeTruthy();
    expect(registry.getRoom(body.gameId)).toBeDefined();
  });
});

function createMockRequest(method: string, path: string, body?: Record<string, unknown>) {
  const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
  const readable = new Readable({
    read() {
      if (payload) {
        this.push(payload);
      }
      this.push(null);
    },
  }) as IncomingMessage;

  readable.method = method;
  readable.url = path;
  readable.headers = { host: 'test.local' } as IncomingHttpHeaders;
  if (payload) {
    readable.headers['content-length'] = String(payload.length);
    readable.headers['content-type'] = 'application/json';
  }

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
