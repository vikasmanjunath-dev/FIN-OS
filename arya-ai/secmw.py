"""
Arya AI - request-level protections as a pure ASGI middleware (it does not buffer or wrap streaming responses, so the
/api/chat server-sent events keep flowing):

  * request body size limit (413) - the largest legitimate body here is a chat message plus a small profile (a few KB);
    without a limit a client can send hundreds of MB to a JSON route and have it parsed;
  * a global per-client request limit (429), on top of the stricter per-route limits in ratelimit.py;
  * response headers that stop browsers from sniffing or framing API responses.

HTTP requests only; WebSocket connections are limited inside their own handler.
"""
from __future__ import annotations

import json

import ratelimit

MAX_BODY_BYTES = 64 * 1024
EXEMPT_PATHS = {"/health"}          # health probes must keep working under load

_SEC_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),
]


class _Request:
    """Just enough of a Starlette request for ratelimit.client_id()."""
    def __init__(self, scope):
        self.headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        c = scope.get("client")
        self.client = type("C", (), {"host": c[0]})() if c else None


async def _send_json(send, status: int, body: dict, extra: list | None = None):
    payload = json.dumps(body).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode()), *_SEC_HEADERS, *(extra or [])]
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": payload})


class SecurityMiddleware:
    def __init__(self, app, max_body: int = MAX_BODY_BYTES):
        self.app = app
        self.max_body = max_body

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        # CORS preflights are cheap and must not be starved by the limiter
        method = scope.get("method", "GET")
        path = scope.get("path", "")
        if method != "OPTIONS" and path not in EXEMPT_PATHS:
            wait = ratelimit.limiter.check("global", ratelimit.client_id(_Request(scope)))
            if wait:
                return await _send_json(send, 429, {"detail": "Too many requests - slow down"},
                                        [(b"retry-after", str(int(wait + 0.999)).encode())])

        declared = None
        for k, v in scope.get("headers", []):
            if k == b"content-length":
                try:
                    declared = int(v)
                except ValueError:
                    return await _send_json(send, 400, {"detail": "Invalid Content-Length"})
        if declared is not None and declared > self.max_body:
            return await _send_json(send, 413, {"detail": "Request body too large"})

        received = 0
        too_big = False

        async def limited_receive():
            nonlocal received, too_big
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body:
                    too_big = True
                    # stop the app reading further: hand it an empty, final body; the response is replaced below
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        started = False

        async def guarded_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                if too_big:
                    started = True
                    return await _send_json(send, 413, {"detail": "Request body too large"})
                headers = list(message.get("headers", []))
                present = {k.lower() for k, _ in headers}
                headers.extend(h for h in _SEC_HEADERS if h[0] not in present)
                message = {**message, "headers": headers}
            elif message["type"] == "http.response.body" and too_big and started:
                return          # the replacement 413 has already been sent in full
            await send(message)

        await self.app(scope, limited_receive, guarded_send)
