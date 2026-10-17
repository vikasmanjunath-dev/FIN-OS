"""docker-compose.yml / nginx-gateway.conf security properties (read from the files; Docker is not run)."""
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
yaml = pytest.importorskip("yaml")
COMPOSE = yaml.safe_load(open(os.path.join(ROOT, "docker-compose.yml")))
NGINX = open(os.path.join(ROOT, "nginx-gateway.conf")).read()


def published(svc):
    return COMPOSE["services"][svc].get("ports", [])


def test_nothing_unauthenticated_is_published_on_all_interfaces():
    for svc in ("ollama", "voice-agent"):
        for p in published(svc):
            assert re.match(r"^(127\.0\.0\.1|\$\{VOICE_BIND:-127\.0\.0\.1\}):", str(p)), (svc, p)


def test_frontend_does_not_serve_the_repository_root():
    vols = COMPOSE["services"]["frontend"]["volumes"]
    for v in vols:
        src, dst = str(v).split(":")[0:2]
        assert src not in (".", "./", "./."), v
        assert not re.search(r"\.env|\.pem|supabase|alerts|arya-ai|rag-engine|voiceagent/(agent|\.)", src), v
        assert str(v).endswith(":ro"), v
    assert "nginx-frontend.conf" not in " ".join(map(str, vols)), "mounts a file that does not exist"


def test_arya_trusts_the_gateway_only_because_it_is_not_published():
    arya = COMPOSE["services"]["arya-ai"]
    assert "ports" not in arya and "ARYA_TRUST_PROXY=1" in arya["environment"]


def test_gateway_cors_is_an_allow_list_and_ip_headers_are_overwritten():
    assert 'Access-Control-Allow-Origin  $cors_origin' in NGINX and not re.search(r'Allow-Origin["\s]+"\*"', NGINX)
    assert r"[a-z0-9-]+\.vercel\.app" not in NGINX.replace(r"finos1(-[a-z0-9-]+)?\.vercel\.app", "")      # no "any vercel.app site"
    assert "X-Real-IP         $remote_addr" in NGINX
    assert "$proxy_add_x_forwarded_for" not in NGINX.split("proxy_set_header")[0] + "".join(NGINX.split("proxy_set_header")[1:]).replace("# not $proxy_add_x_forwarded_for", "")
    assert "server_tokens off" in NGINX


def test_operator_routes_are_not_reachable_through_the_gateway():
    assert re.search(r"location = /api/arya/api/cache/clear\s*\{\s*return 403", NGINX)
    assert re.search(r"location \^~ /api/arya/docs\s*\{\s*return 404", NGINX)
