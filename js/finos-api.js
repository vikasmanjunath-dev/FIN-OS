/**
 * FIN-OS API client — one place that knows where every backend lives.   (v1.0)
 *
 * Replaces hardcoded 'http://localhost:7475' style constants scattered across the codebase.
 *
 *   FinosAPI.request('arya', '/api/chat', { method:'POST', body:{...} })   → parsed JSON
 *   FinosAPI.stream('arya', '/api/chat/stream', { body:{...}, onToken })   → SSE / chunked text
 *   FinosAPI.health()                                                      → { status, services:[…] }
 *   FinosAPI.base('rag')                                                   → resolved base URL
 *   FinosAPI.available('alerts')                                           → true when a backend URL resolves (never throws)
 *   FinosAPI.poll(fn, ms, { immediate })                                   → stop()   — visibility-aware, never overlaps
 *   FinosAPI.invalidate('alerts')                                          → drop cached GETs (all, or one service)
 *
 * Efficiency (v1.1): identical in-flight GETs are shared (one network call, N callers); pass { ttl: ms } to
 * also reuse the parsed response for a while. Shared results are the SAME object — treat them as read-only.
 * The timeout now covers reading the body too, not just the response headers.
 *
 * Base-URL resolution (first match wins):
 *   1. localStorage 'finos_api_gateway'  or  window.FINOS_API_GATEWAY   → "<gateway>/api/<service>"
 *   2. localhost / 127.0.0.1 page        → legacy direct dev ports (so nothing breaks today)
 *   3. otherwise                         → null  (backend not available; callers get a typed error)
 *
 * Errors are always FinosApiError { code, status, service, retryable } — never a bare TypeError.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosAPI = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  /** service → { gateway path segment, dev port, health path } */
  const SERVICES = {
    arya:   { seg: 'arya',   port: 7475, health: '/health' },
    rag:    { seg: 'rag',    port: 7476, health: '/api/health' },
    alerts: { seg: 'alerts', port: 8001, health: '/health' },
    stocks: { seg: 'stocks', port: 8003, health: '/api/health' },
    docs:   { seg: 'docs',   port: 8004, health: '/health' },
    market: { seg: 'market', port: 5000, health: '/' },
  };

  class FinosApiError extends Error {
    constructor(message, { code, status, service, retryable = false, cause } = {}) {
      super(message);
      this.name = 'FinosApiError';
      this.code = code || 'unknown';         // offline | timeout | http | parse | unavailable | aborted
      this.status = status || 0;
      this.service = service;
      this.retryable = retryable;
      if (cause) this.cause = cause;
    }
  }

  function gatewayBase() {
    try { const v = root.localStorage && root.localStorage.getItem('finos_api_gateway'); if (v) return v.replace(/\/+$/, ''); } catch (_) {}
    return root.FINOS_API_GATEWAY ? String(root.FINOS_API_GATEWAY).replace(/\/+$/, '') : null;
  }
  function isLocalPage() {
    const h = root.location && root.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  }

  function base(service) {
    const s = SERVICES[service];
    if (!s) throw new FinosApiError('Unknown service: ' + service, { code: 'unknown', service });
    const gw = gatewayBase();
    if (gw) return `${gw}/api/${s.seg}`;
    if (isLocalPage()) return `http://localhost:${s.port}`;
    return null;
  }

  function requestId() { return 'fe-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  async function authHeader() {
    try {
      const c = root.FINOS_SB && root.FINOS_SB.getClient && root.FINOS_SB.getClient();
      if (!c) return {};
      const { data } = await c.auth.getSession();
      const t = data && data.session && data.session.access_token;
      return t ? { Authorization: 'Bearer ' + t } : {};
    } catch (_) { return {}; }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const defaults = { timeout: 15000, retries: 2, retryDelay: 400 };

  /* GET dedupe + optional TTL cache. key = service + path (auth does not change the payload for a given user). */
  const inflight = new Map();   // key → Promise
  const cache = new Map();      // key → { exp, value }
  const CACHE_MAX = 80;         // bounded: oldest entry evicted first

  function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return undefined;
    if (hit.exp <= Date.now()) { cache.delete(key); return undefined; }
    return hit;
  }
  function cachePut(key, value, ttl) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { exp: Date.now() + ttl, value });
  }
  function invalidate(service) {
    if (!service) { cache.clear(); return; }
    const prefix = service + ' ';
    for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
  }
  function available(service) {
    try { return !!base(service); } catch (_) { return false; }
  }

  /**
   * @param {string} service  key of SERVICES
   * @param {string} path     e.g. '/api/chat'
   * @param {object} [opts]   { method, body, headers, timeout, retries, signal, auth, raw }
   */
  function request(service, path, opts) {
    const o = opts || {};
    const method = (o.method || 'GET').toUpperCase();
    // Only plain GETs are shared: writes, raw/streamed responses and caller-cancellable requests stay independent.
    if ((method !== 'GET') || o.raw || o.signal || o.dedupe === false) {
      if (method !== 'GET' && method !== 'HEAD') invalidate(service);   // a write may change what a cached GET returns
      return _send(service, path, opts);
    }
    const key = service + ' ' + path;
    if (o.ttl > 0) { const hit = cacheGet(key); if (hit) return Promise.resolve(hit.value); }
    let p = inflight.get(key);
    if (!p) {
      p = _send(service, path, opts).then(
        (v) => { inflight.delete(key); if (o.ttl > 0) cachePut(key, v, o.ttl); return v; },
        (e) => { inflight.delete(key); throw e; });
      inflight.set(key, p);
    }
    return p;
  }

  async function _send(service, path, opts) {
    const o = Object.assign({}, defaults, opts);
    const method = (o.method || 'GET').toUpperCase();
    const b = base(service);
    if (!b) throw new FinosApiError(`${service} backend is not available here`, { code: 'unavailable', service });

    const idempotent = method === 'GET' || method === 'HEAD';
    const maxTries = idempotent ? o.retries + 1 : 1;       // never auto-retry writes
    let lastErr;

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort('timeout'), o.timeout);
      const onAbort = () => ctl.abort('aborted');
      if (o.signal) o.signal.addEventListener('abort', onAbort, { once: true });
      try {
        const headers = Object.assign({ Accept: 'application/json', 'X-Request-Id': requestId() },
          o.auth === false ? {} : await authHeader(), o.headers);
        let body;
        if (o.body !== undefined) {
          if (typeof o.body === 'string' || (root.FormData && o.body instanceof root.FormData)) body = o.body;
          else { body = JSON.stringify(o.body); headers['Content-Type'] = 'application/json'; }
        }
        const res = await fetch(b + path, { method, headers, body, signal: ctl.signal });
        if (o.raw) clearTimeout(timer);            // streamed responses own their lifetime; everything else keeps the timer through the body read
        if (!res.ok) {
          const retryable = res.status >= 500 || res.status === 429;
          let detail = ''; try { detail = (await res.text()).slice(0, 200); } catch (_) {}
          throw new FinosApiError(`${service} ${res.status}${detail ? ': ' + detail : ''}`, { code: 'http', status: res.status, service, retryable });
        }
        if (o.raw) return res;
        const text = await res.text();
        clearTimeout(timer);
        if (!text) return null;
        try { return JSON.parse(text); }
        catch (e) { throw new FinosApiError(`${service} returned non-JSON`, { code: 'parse', service, cause: e }); }
      } catch (e) {
        clearTimeout(timer);
        lastErr = e instanceof FinosApiError ? e
          : new FinosApiError(
              ctl.signal.aborted ? (ctl.signal.reason === 'timeout' ? `${service} timed out` : 'Request cancelled') : `${service} unreachable`,
              { code: ctl.signal.aborted ? (ctl.signal.reason === 'timeout' ? 'timeout' : 'aborted') : 'offline', service, retryable: ctl.signal.reason !== 'aborted', cause: e });
        if (!lastErr.retryable || attempt === maxTries) throw lastErr;
        await sleep(o.retryDelay * Math.pow(2, attempt - 1));
      } finally {
        if (o.signal) o.signal.removeEventListener('abort', onAbort);
      }
    }
    throw lastErr;
  }

  /** POST and read a streamed response (SSE `data:` lines or plain chunks). Resolves with the full text. */
  async function stream(service, path, opts) {
    const o = Object.assign({}, opts, { raw: true, retries: 0, method: (opts && opts.method) || 'POST', timeout: (opts && opts.timeout) || 300000,
      headers: Object.assign({ Accept: 'text/event-stream' }, opts && opts.headers) });
    const res = await request(service, path, o);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let full = '', buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        const m = line.match(/^data:\s?(.*)$/);
        const tok = m ? m[1] : (line.startsWith(':') || !line ? null : line);
        if (tok === null || tok === '[DONE]') continue;
        full += tok;
        if (o.onToken) o.onToken(tok);
      }
    }
    return full;
  }

  /** Gateway-aggregated status when available, else probe each service directly. */
  async function health() {
    const gw = gatewayBase();
    if (gw) {
      try { const r = await fetch(gw + '/health'); return await r.json(); } catch (_) { return { status: 'down', services: [] }; }
    }
    const results = await Promise.all(Object.keys(SERVICES).map(async (name) => {
      const b = base(name);
      if (!b) return { name, status: 'down', detail: 'unavailable' };
      const t0 = Date.now();
      try {
        const r = await fetch(b + SERVICES[name].health, { signal: AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined });
        return { name, status: r.status < 500 ? 'up' : 'down', latency_ms: Date.now() - t0 };
      } catch (_) { return { name, status: 'down', latency_ms: Date.now() - t0 }; }
    }));
    const up = results.filter((r) => r.status === 'up').length;
    return { status: up === results.length ? 'ok' : up ? 'degraded' : 'down', services: results };
  }

  /**
   * Run fn every `ms`, but only while the tab is visible and never overlapping a still-running call.
   * Coming back to a tab that went stale re-runs fn straight away. Returns stop().
   *   const stop = FinosAPI.poll(refresh, 5 * 60 * 1000);
   */
  function poll(fn, ms, opts) {
    const o = opts || {};
    let timer = null, running = false, last = 0, stopped = false;
    const doc = root.document;
    async function tick() {
      if (stopped || running) return;
      if (doc && doc.hidden) return;
      running = true; last = Date.now();
      try { await fn(); } catch (_) { /* a failing poll must not kill the loop */ }
      finally { running = false; }
    }
    function onVis() { if (doc && !doc.hidden && Date.now() - last >= ms) tick(); }
    timer = setInterval(tick, ms);
    if (doc) doc.addEventListener('visibilitychange', onVis);
    if (o.immediate) tick();
    return function stop() {
      stopped = true; clearInterval(timer);
      if (doc) doc.removeEventListener('visibilitychange', onVis);
    };
  }

  return { SERVICES, FinosApiError, base, available, request, stream, health, poll, invalidate };
});
