"""api/chat.js (Vercel Edge proxy to OpenRouter) spends the owner's credit for whoever calls it. Run under node with a stubbed fetch:
the real OpenRouter is never contacted and no key is used."""
import json
import os
import shutil
import subprocess
import tempfile

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")

DRIVER = r"""
import { pathToFileURL } from 'node:url';
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
  return new Response('data: {"choices":[]}\n\n', { status: 200 }); };
process.env.OPENROUTER_API_KEY = 'test-key-not-real';
const mod = await import(pathToFileURL(process.argv[2]).href);
const h = mod.default;
const post = (body, headers = {}, raw) => h(new Request('https://x.test/api/chat', { method: 'POST',
  headers: { 'content-type': 'application/json', ...headers }, body: raw ?? JSON.stringify(body) }));
const ok = { messages: [{ role: 'user', content: 'hi' }] };
const out = {};
out.basic = (await post(ok)).status;
out.upstream = calls[0];
out.model = (await post({ ...ok, model: 'anthropic/claude-opus-4' })).status;
out.noModelCalls = calls.length;
out.tokens = (await post({ ...ok, max_tokens: 1000000 }), calls[calls.length - 1].body.max_tokens);
out.extraFields = (await post({ messages: [{ role: 'user', content: 'x', tool_calls: [1], name: 'n' }], plugins: ['web'] }), Object.keys(calls[calls.length - 1].body.messages[0]).sort().join());
out.noPlugins = !('plugins' in calls[calls.length - 1].body);
out.bigMsg = (await post({ messages: [{ role: 'user', content: 'a'.repeat(8001) }] })).status;
out.manyMsgs = (await post({ messages: Array(31).fill({ role: 'user', content: 'a' }) })).status;
out.badRole = (await post({ messages: [{ role: 'tool', content: 'a' }] })).status;
out.nonString = (await post({ messages: [{ role: 'user', content: { a: 1 } }] })).status;
out.hugeBody = (await post(null, {}, JSON.stringify({ messages: [{ role: 'user', content: 'a'.repeat(70000) }] }))).status;
out.badJson = (await post(null, {}, '{nope')).status;
out.array = (await post([1, 2])).status;
const evil = await post(ok, { origin: 'https://evil.example' });
out.evilOrigin = [evil.status, evil.headers.get('access-control-allow-origin')];
const good = await post(ok, { origin: 'https://finos1.vercel.app' });
out.goodOrigin = [good.status, good.headers.get('access-control-allow-origin')];
const loc = await h(new Request('https://x.test/api/chat', { method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } }));
out.preflight = [loc.status, loc.headers.get('access-control-allow-origin')];
out.get = (await h(new Request('https://x.test/api/chat'))).status;
// the provider's error text must not reach the caller
globalThis.fetch = async () => new Response('{"error":"key sk-or-v1-abc... account jane@x.com out of credit"}', { status: 402 });
const err = await post(ok, { 'x-forwarded-for': '9.9.9.9' });
out.providerErr = [err.status, (await err.text()).includes('sk-or')];
// rate limit: one address, many requests
globalThis.fetch = async () => new Response('x', { status: 200 });
const codes = [];
for (let i = 0; i < 25; i++) codes.push((await post(ok, { 'x-forwarded-for': '7.7.7.7' })).status);
out.limited = [codes.filter(c => c === 200).length, codes.filter(c => c === 429).length];
out.otherIp = (await post(ok, { 'x-forwarded-for': '8.8.8.8' })).status;
delete process.env.OPENROUTER_API_KEY;
const nokey = await post(ok, { 'x-forwarded-for': '6.6.6.6' });
out.noKey = [nokey.status, (await nokey.text()).includes('Vercel')];
console.log(JSON.stringify(out));
"""


@pytest.fixture(scope="module")
def result():
    with tempfile.TemporaryDirectory() as d:
        shutil.copy(os.path.join(ROOT, "api", "chat.js"), os.path.join(d, "chat.mjs"))     # as an ES module, away from the repo's package.json
        drv = os.path.join(d, "driver.mjs")
        open(drv, "w").write(DRIVER)
        p = subprocess.run(["node", drv, os.path.join(d, "chat.mjs")], capture_output=True, text=True, timeout=60)
    assert p.returncode == 0, p.stderr
    return json.loads(p.stdout.strip().splitlines()[-1])


def test_valid_request_is_forwarded_with_the_server_side_key_only(result):
    assert result["basic"] == 200
    assert result["upstream"]["body"]["model"] == "google/gemini-2.0-flash-001" and result["upstream"]["auth"] == "Bearer test-key-not-real"


def test_caller_cannot_pick_an_expensive_model_or_raise_the_token_cap(result):
    assert result["model"] == 400 and result["noModelCalls"] == 1
    assert result["tokens"] == 1024


def test_only_role_and_content_are_forwarded(result):
    assert result["extraFields"] == "content,role" and result["noPlugins"]


@pytest.mark.parametrize("key", ["bigMsg", "manyMsgs", "badRole", "nonString", "badJson", "array"])
def test_malformed_or_oversized_input_is_rejected(result, key):
    assert result[key] == 400


def test_huge_body_is_rejected(result):
    assert result["hugeBody"] in (400, 413)


def test_cors_is_an_allow_list_not_a_wildcard(result):
    assert result["evilOrigin"] == [403, None]
    assert result["goodOrigin"] == [200, "https://finos1.vercel.app"]
    assert result["preflight"] == [204, "http://localhost:3000"]
    assert result["get"] == 405


def test_provider_error_text_is_not_passed_to_the_caller(result):
    assert result["providerErr"] == [502, False]


def test_requests_per_address_are_limited(result):
    assert result["limited"] == [20, 5] and result["otherIp"] == 200


def test_missing_key_message_does_not_point_at_the_dashboard(result):
    assert result["noKey"] == [503, False]
