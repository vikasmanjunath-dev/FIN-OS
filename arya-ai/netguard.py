"""
Arya AI - outbound request guard (SSRF defence) for anything that fetches a URL a caller supplied.

Used by data.news.read_url (GET /api/read and the `read_url` tool). The caller controls the URL, so without a guard
http://localhost:11434/api/tags (Ollama), http://alert-engine:8001/... (no auth inside the compose network),
http://169.254.169.254/ (cloud metadata) and every other address on the machine's network are one request away.

Rules:
  * scheme http or https only, no credentials in the URL, port 80/443/8080/8443 only (or none);
  * the host must resolve, and EVERY address it resolves to must be a public one (ipaddress.is_global): loopback,
    private, link-local, CGNAT, multicast, reserved, unspecified and IPv4-mapped IPv6 forms of those are refused;
  * redirects are followed by hand (at most MAX_REDIRECTS) and each hop goes through the same checks;
  * the body is read in chunks and cut at MAX_BYTES; only text-like content types are accepted.

Known limit (documented in docs/agent-notes/backend-security.md): the address is validated just before the connection is made,
and `requests` resolves the name again when it connects. An attacker who controls the DNS answer for a domain could return a
public address to the check and a private one to the connection (DNS rebinding). Closing that needs the connection to be
pinned to the validated address; for plain http this module does so, for https it does not (certificate name checks make it
more involved). Deploy-time egress rules (the arya-ai container should not be able to reach private ranges) remove the rest.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urljoin, urlsplit

import requests

MAX_REDIRECTS = 3
MAX_BYTES = 2_000_000
ALLOWED_PORTS = {None, 80, 443, 8080, 8443}
ALLOWED_CONTENT_TYPES = ("text/", "application/xhtml", "application/xml", "application/json", "application/rss", "application/atom")


class BlockedURL(ValueError):
    """The URL is not allowed to be fetched on behalf of a caller."""


def _public_ip(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr.split("%")[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    # is_global is False for private, loopback, link-local, CGNAT (100.64/10), reserved, documentation ranges, etc.
    return ip.is_global and not ip.is_multicast


def resolve_public(host: str, port: int | None) -> list[str]:
    """Addresses of `host` if (and only if) all of them are public; raises BlockedURL otherwise."""
    try:
        infos = socket.getaddrinfo(host, port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise BlockedURL("host could not be resolved")
    addrs = sorted({i[4][0] for i in infos})
    if not addrs:
        raise BlockedURL("host could not be resolved")
    for a in addrs:
        if not _public_ip(a):
            raise BlockedURL("host is not a public address")
    return addrs


def check_url(url: str) -> tuple[str, int | None, list[str]]:
    """Validate a URL; returns (host, port, public addresses). Raises BlockedURL."""
    if not isinstance(url, str) or not url or len(url) > 2048:
        raise BlockedURL("invalid URL")
    if any(ord(c) < 33 or ord(c) == 127 for c in url):
        raise BlockedURL("invalid URL")
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise BlockedURL("only http and https URLs can be read")
    if parts.username or parts.password:
        raise BlockedURL("URLs with credentials are not allowed")
    host = parts.hostname
    if not host:
        raise BlockedURL("invalid URL")
    try:
        port = parts.port
    except ValueError:
        raise BlockedURL("invalid port")
    if port not in ALLOWED_PORTS:
        raise BlockedURL("port not allowed")
    if host.lower() in ("localhost", "localhost.localdomain") or host.lower().endswith((".localhost", ".local", ".internal")):
        raise BlockedURL("host is not a public address")
    return host, port, resolve_public(host, port)


def fetch_text(url: str, headers: dict | None = None, timeout: float = 10.0, session=None) -> tuple[str, str]:
    """GET `url` under the rules above. Returns (final_url, text). Raises BlockedURL for a refused URL or content type,
    requests exceptions for network failures."""
    get = (session or requests).get
    current = url
    for hop in range(MAX_REDIRECTS + 1):
        host, port, addrs = check_url(current)
        parts = urlsplit(current)
        req_url, req_headers = current, dict(headers or {})
        if parts.scheme == "http":
            # pin the connection to the address that was just validated (no second DNS lookup)
            ip = addrs[0]
            netloc = f"[{ip}]" if ":" in ip else ip
            if port:
                netloc += f":{port}"
            req_url = parts._replace(netloc=netloc).geturl()
            req_headers["Host"] = parts.netloc.rsplit("@", 1)[-1]
        r = get(req_url, headers=req_headers, timeout=timeout, allow_redirects=False, stream=True)
        try:
            if r.is_redirect or r.status_code in (301, 302, 303, 307, 308):
                loc = r.headers.get("Location")
                if not loc:
                    raise BlockedURL("redirect without a location")
                current = urljoin(current, loc)
                continue
            r.raise_for_status()
            ctype = (r.headers.get("Content-Type") or "").lower()
            if ctype and not ctype.startswith(ALLOWED_CONTENT_TYPES):
                raise BlockedURL("content type not supported")
            declared = r.headers.get("Content-Length")
            if declared and declared.isdigit() and int(declared) > MAX_BYTES:
                raise BlockedURL("page is too large")
            chunks, total = [], 0
            for chunk in r.iter_content(chunk_size=16384):
                total += len(chunk)
                if total > MAX_BYTES:
                    break               # read what fits; extraction only needs the start of the page
                chunks.append(chunk)
            body = b"".join(chunks)
            enc = r.encoding or "utf-8"
            return current, body.decode(enc, errors="replace")
        finally:
            r.close()
    raise BlockedURL("too many redirects")
