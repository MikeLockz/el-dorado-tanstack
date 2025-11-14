import type { TestServer } from './server.js';

type JsonResponse = Awaited<ReturnType<typeof fetch>>;

interface JsonRequestOptions {
  path: string;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  expectedStatus?: number;
}

export async function requestJson<TResponse>(server: TestServer, options: JsonRequestOptions): Promise<TResponse> {
  const url = new URL(options.path, server.baseUrl);
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await safeParse(response);
  const expected = options.expectedStatus ?? 200;
  if (response.status !== expected) {
    throw new Error(`Expected status ${expected} for ${url.pathname} but received ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload as TResponse;
}

async function safeParse(response: JsonResponse): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
