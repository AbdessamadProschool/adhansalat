/**
 * Service-worker behaviour tests.
 *
 * The worker is a plain script, so it is executed here inside a `node:vm`
 * context with a minimal Cache Storage + fetch stub. That lets us assert the
 * three things that actually matter and that a browser smoke test cannot pin
 * down reliably:
 *
 *  1. install precaches every entry and survives one broken entry;
 *  2. a navigation is served from the cached shell when the network fails;
 *  3. a navigation is served from the cached shell when the network answers with
 *     an error page (captive portal / proxy 502) instead of the app;
 *  4. asset requests fall back to cache, and requests we must not touch (Range,
 *     cross-origin, /sw.js) are left alone.
 */

import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { renderServiceWorker } from '../src/pwa/sw-template.js';

const BASE = 'https://app.test';
const PRECACHE = ['/', '/index.html', '/assets/app.js', '/audio/chime-calm.wav', '/patterns/zellige.svg'];

function keyOf(input: Request | string): string {
  return new URL(typeof input === 'string' ? input : input.url, BASE).href;
}

class MemoryCache {
  readonly map = new Map<string, Response>();

  /** `load` is the network the worker would use for `cache.add()`. */
  constructor(private readonly load: (url: string) => Promise<Response>) {}

  async add(request: Request | string): Promise<void> {
    const url = keyOf(request);
    const response = await this.load(url);
    if (!response.ok) throw new Error(`add failed: ${url}`);
    this.map.set(url, response);
  }
  async put(request: Request | string, response: Response): Promise<void> {
    this.map.set(keyOf(request), response);
  }
  async match(request: Request | string): Promise<Response | undefined> {
    return this.map.get(keyOf(request));
  }
  async keys(): Promise<Request[]> {
    return [...this.map.keys()].map((url) => new Request(url));
  }
  async delete(request: Request | string): Promise<boolean> {
    return this.map.delete(keyOf(request));
  }
}

/** A Request-shaped object: SW `Request` objects are browser-only. */
function fakeRequest(
  url: string,
  options: { method?: string; mode?: string; headers?: Record<string, string> } = {},
): Request {
  const headers = new Headers(options.headers ?? {});
  return {
    url: new URL(url, BASE).href,
    method: options.method ?? 'GET',
    mode: options.mode ?? 'cors',
    headers,
    destination: 'document',
  } as unknown as Request;
}

interface Runtime {
  network: (url: string, init?: RequestInit) => Promise<Response>;
}

function createWorker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const runtime: Runtime = {
    network: async () => new Response('network', { status: 200 }),
  };
  const cache = new MemoryCache((url) => runtime.network(url));

  const self = {
    location: { origin: BASE },
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers.set(type, handler);
    },
    skipWaiting: () => undefined,
    clients: {
      claim: async () => undefined,
      matchAll: async () => [],
      openWindow: async () => undefined,
    },
  };

  const context = vm.createContext({
    self,
    caches: {
      open: async () => cache,
      keys: async () => ['azan-v1'],
      delete: async () => true,
    },
    fetch: (request: Request | string, init?: RequestInit) =>
      runtime.network(keyOf(request), init),
    // Browsers resolve relative URLs against the worker's own location; Node
    // refuses them, so the shim does the resolution the platform would do.
    Request: class extends Request {
      constructor(input: string | Request, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, BASE).href : input, init);
      }
    },
    Response,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
  });

  vm.runInContext(renderServiceWorker(PRECACHE), context, { filename: 'sw.js' });

  const dispatch = async (type: string, event: Record<string, unknown>) => {
    const handler = handlers.get(type);
    if (!handler) throw new Error(`no handler for ${type}`);
    let responded: Promise<unknown> | undefined;
    let waited: Promise<unknown> | undefined;
    const eventWithFns = {
      ...event,
      respondWith: (promise: Promise<unknown>) => {
        responded = promise;
      },
      waitUntil: (promise: Promise<unknown>) => {
        waited = promise;
      },
    };
    handler(eventWithFns);
    return { responded, waited };
  };

  return { runtime, cache, handlers, dispatch };
}

async function install(worker: ReturnType<typeof createWorker>) {
  const { waited } = await worker.dispatch('install', {});
  await waited;
}

function navigationRequest(url = `${BASE}/#/calendar`): Request {
  // A real navigation request cannot be constructed with `mode: 'navigate'`;
  // the worker only reads `mode` and `url`, so a shaped object is enough.
  return fakeRequest(url, { mode: 'navigate' });
}

describe('service worker', () => {
  it('precaches every entry on install', async () => {
    const worker = createWorker();
    await install(worker);
    const keys = [...worker.cache.map.keys()].sort();
    expect(keys).toEqual(PRECACHE.map((path) => `${BASE}${path}`).sort());
  });

  it('finishes installing even when one precache entry is missing', async () => {
    const worker = createWorker();
    worker.runtime.network = async (url) =>
      url.endsWith('/audio/chime-calm.wav')
        ? new Response('nope', { status: 404 })
        : new Response('ok', { status: 200 });
    await install(worker);
    expect(worker.cache.map.has(`${BASE}/index.html`)).toBe(true);
    expect(worker.cache.map.has(`${BASE}/audio/chime-calm.wav`)).toBe(false);
  });

  it('removes hashed bundles left by earlier builds on activate', async () => {
    const worker = createWorker();
    await install(worker);
    worker.cache.map.set(`${BASE}/assets/index-old.js`, new Response('old bundle'));
    worker.cache.map.set(`${BASE}/data/cities/ma-07.json`, new Response('{}'));

    const { waited } = await worker.dispatch('activate', {});
    await waited;

    expect(worker.cache.map.has(`${BASE}/assets/index-old.js`)).toBe(false);
    // Current assets and runtime-cached data survive the sweep.
    expect(worker.cache.map.has(`${BASE}/assets/app.js`)).toBe(true);
    expect(worker.cache.map.has(`${BASE}/data/cities/ma-07.json`)).toBe(true);
  });

  it('serves the cached shell when the network is unreachable', async () => {
    const worker = createWorker();
    await install(worker);
    worker.runtime.network = async () => {
      throw new TypeError('Failed to fetch');
    };
    const { responded } = await worker.dispatch('fetch', { request: navigationRequest() });
    const response = (await responded) as Response;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('network');
  });

  it('prefers the cached shell over a proxy or captive-portal error page', async () => {
    const worker = createWorker();
    await install(worker);
    worker.runtime.network = async () => new Response('<h1>502 Bad Gateway</h1>', { status: 502 });
    const { responded } = await worker.dispatch('fetch', { request: navigationRequest() });
    const response = (await responded) as Response;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('network');
  });

  it('serves a cached asset when offline', async () => {
    const worker = createWorker();
    await install(worker);
    worker.runtime.network = async () => {
      throw new TypeError('Failed to fetch');
    };
    const request = fakeRequest(`${BASE}/assets/app.js`);
    const { responded } = await worker.dispatch('fetch', { request });
    const response = (await responded) as Response;
    expect(response.status).toBe(200);
  });

  it('caches a downloaded Moroccan region and serves it offline', async () => {
    const worker = createWorker();
    await install(worker);
    worker.runtime.network = async () =>
      new Response('{"cities":[]}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const url = `${BASE}/data/cities/ma-07.json`;

    const first = await worker.dispatch('fetch', { request: fakeRequest(url) });
    expect(((await first.responded) as Response).status).toBe(200);
    expect(worker.cache.map.has(url)).toBe(true);

    worker.runtime.network = async () => {
      throw new TypeError('Failed to fetch');
    };
    const second = await worker.dispatch('fetch', { request: fakeRequest(url) });
    const response = (await second.responded) as Response;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"cities":[]}');
  });

  it('ignores requests it must not mediate', async () => {
    const worker = createWorker();
    await install(worker);
    const cases = [
      fakeRequest(`${BASE}/assets/app.js`, { headers: { range: 'bytes=0-99' } }),
      fakeRequest('https://other.example/app.js'),
      fakeRequest(`${BASE}/sw.js`),
      fakeRequest(`${BASE}/data`, { method: 'POST' }),
    ];
    for (const request of cases) {
      const { responded } = await worker.dispatch('fetch', { request });
      expect(responded, `${request.method} ${request.url}`).toBeUndefined();
    }
  });

  it('does not answer a navigation from an empty cache with a fake success', async () => {
    const worker = createWorker();
    worker.runtime.network = async () => {
      throw new TypeError('Failed to fetch');
    };
    const { responded } = await worker.dispatch('fetch', { request: navigationRequest() });
    const response = (await responded) as Response;
    expect(response.status).toBe(503);
  });
});
