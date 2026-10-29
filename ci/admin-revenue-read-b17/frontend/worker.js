import { fetchInlineAsset } from './admin-inline-public.mjs';
import {adminReleaseIdentity} from './admin-release-identity.mjs';
import {restoredAdminReadAllowed} from './admin-restored-read-routing.mjs';
// .offline-build/fastlik-Admin/src/b17-paused.ts
function windowResponse(request, env, now = Date.now()) {
  if (env.FASTLINK_PREVIEW_DEPLOYMENT_PROFILE !== "B17_READONLY_MONTH_V1") return null;
  const retention = Date.parse(String(env.B17_RETENTION_UNTIL_UTC));
  const open = Date.parse(String(env.B17_WINDOW_OPEN_UTC)), close = Date.parse(String(env.B17_WINDOW_CLOSE_UTC));
  const qualifyUntil = Date.parse(String(env.B17_QUALIFY_UNTIL_UTC));
  const paidStart = Date.parse(String(env.B17_PAID_START_UTC));
  const paidStop = Date.parse(String(env.B17_PAID_STOP_UTC));
  const preparing = env.B17_WINDOW_PHASE === "QUALIFYING" && Number.isFinite(qualifyUntil) && Number.isFinite(paidStart) && Number.isFinite(paidStop) && now >= paidStart && now < qualifyUntil && qualifyUntil <= paidStop && paidStop <= retention;
  const valid = Number.isFinite(retention) && now < retention;
  const active = valid && (preparing || env.B17_WINDOW_PHASE === "OPEN" && Number.isFinite(open) && Number.isFinite(close) && close - open >= 28 * 86400000 && close - open <= 32 * 86400000 && close <= paidStop && paidStop <= retention && now >= open && now < close);
  if (active) return null;
  const api = /^\/api(?:\/|$)/.test(new URL(request.url).pathname);
  const headers = { "cache-control": "no-store", "x-fastlink-data-state": "PAUSED" };
  if (api) return Response.json({ code: "B17_DATA_PAUSED", message: "\u6570\u636E\u670D\u52A1\u5DF2\u6682\u505C" }, { status: 503, headers });
  return new Response(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FastLink \u9884\u89C8</title><main><h1>\u6570\u636E\u670D\u52A1\u5DF2\u6682\u505C</h1><p>\u9884\u89C8\u5730\u5740\u4ECD\u4FDD\u7559\u3002\u672C\u6B21\u67E5\u770B\u7A97\u53E3\u5C1A\u672A\u5F00\u59CB\u6216\u5DF2\u7ECF\u7ED3\u675F\uFF0C\u5F53\u524D\u672A\u5C55\u793A\u5B9E\u65F6\u4E1A\u52A1\u6570\u636E\u3002</p><p>\u540E\u7EED\u7A97\u53E3\u6309\u9700\u5F00\u542F\uFF1B\u8BF7\u5728\u83B7\u77E5\u65B0\u7A97\u53E3\u540E\u91CD\u65B0\u6253\u5F00\u6B64\u5730\u5740\u3002</p></main></html>',
    { status: 200, headers: {
      ...headers,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    } }
  );
}

// .offline-build/fastlik-Admin/src/launch/b10-policy.ts
var id = "[A-Za-z0-9_-]{2,128}";
var wallet = [
  { methods: ["POST"], path: /^\/v1\/auth\/(register|login|refresh|logout)$/ },
  { methods: ["GET"], path: /^\/v1\/session$/ },
  { methods: ["GET"], path: /^\/v1\/kyc\/status$/ },
  { methods: ["GET"], path: /^\/v1\/wallet\/(assets|balances|accounts)$/ },
  { methods: ["GET"], path: /^\/v1\/wallet\/transactions$/, query: ["assetCode", "limit", "cursor", "type", "status"], required: ["assetCode"] },
  { methods: ["GET"], path: new RegExp(`^/v1/wallet/accounts/${id}/transactions$`), query: ["assetCode", "limit", "cursor", "type", "status"], required: ["assetCode"] },
  { methods: ["GET"], path: new RegExp(`^/v1/wallet/transactions/${id}$`) },
  { methods: ["GET"], path: /^\/v1\/wallet\/operations$/, query: ["limit", "cursor", "type", "status"] },
  { methods: ["GET"], path: new RegExp(`^/v1/wallet/operations/${id}$`) },
  { methods: ["GET"], path: /^\/v1\/cards$/, query: ["limit", "cursor"] },
  { methods: ["GET"], path: new RegExp(`^/v1/cards/${id}$`) },
  { methods: ["GET"], path: new RegExp(`^/v1/cards/${id}/transactions$`), query: ["limit", "cursor", "status"] },
  { methods: ["GET"], path: new RegExp(`^/v1/cards/${id}/transactions/${id}$`) }
];
var admin = [
  { methods: ["POST"], path: /^\/admin\/auth\/(login|logout)$/ },
  { methods: ["GET"], path: /^\/admin\/auth\/me$/ },
  { methods: ["GET"], path: new RegExp(`^/admin/tenants/${id}/users/${id}/kyc$`), query: ["environment"], required: ["environment"] },
  { methods: ["GET"], path: new RegExp(`^/admin/tenants/${id}/users(?:/${id})?$`), query: ["environment"], required: ["environment"] },
  { methods: ["PATCH"], path: new RegExp(`^/admin/tenants/${id}/users/${id}/kyc$`) },
  { methods: ["GET"], path: new RegExp(`^/admin/tenants/${id}/cards/${id}/snapshot$`) },
  { methods: ["GET"], path: new RegExp(`^/admin/tenants/${id}/operations/card-support/[A-Za-z0-9._:-]{8,128}$`) },
  { methods: ["GET"], path: new RegExp(`^/admin/tenants/${id}/support-cases$`), query: ["traceId"], required: ["traceId"] },
  { methods: ["POST"], path: new RegExp(`^/admin/tenants/${id}/support-cases$`) },
  { methods: ["GET", "PATCH"], path: new RegExp(`^/admin/tenants/${id}/support-cases/${id}$`) }
];
function allowed(target, method, routes) {
  if (typeof target !== "string" || target.length > 4096 || !/^[\x21-\x7e]+$/.test(target)) return false;
  const [path, query, extra] = target.split("?");
  if (extra !== void 0 || /[%\\;#]/.test(path) || path.includes("//") || /\/(?:\.|\.\.)(?:\/|$)/.test(path)) return false;
  const route = routes.find((r) => r.methods.includes(method) && r.path.test(path));
  if (!route) return false;
  const seen = /* @__PURE__ */ new Set();
  for (const [key, value] of new URLSearchParams(query ?? "")) {
    if (method !== "GET" || !route.query?.includes(key) || seen.has(key) || !value) return false;
    seen.add(key);
    if (key === "environment" && !["TEST", "SANDBOX"].includes(value)) return false;
    if (key === "limit" && !/^(?:[1-9][0-9]?|100)$/.test(value)) return false;
    if (key === "assetCode" && !/^[A-Z][A-Z0-9]{1,15}$/.test(value)) return false;
    if (key === "cursor" && !/^[A-Za-z0-9._~+/=:-]{1,2048}$/.test(value)) return false;
    if ((key === "status" || key === "type") && !/^[A-Z][A-Z_]{1,39}$/.test(value)) return false;
    if (key === "traceId" && !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) return false;
  }
  return (route.required ?? []).every((key) => seen.has(key));
}
var walletRequestAllowed = (path, method = "GET") => allowed(path, method, wallet);
var adminRequestAllowed = (path, method = "GET") => allowed(path, method, admin) || restoredAdminReadAllowed(path, method);
var serverRequestAllowed = (path, method) => path.startsWith("/api/") && (walletRequestAllowed(path.slice(4), method) || adminRequestAllowed(path.slice(4), method) || method === "GET" && /^\/api\/health(?:\/readiness)?$/.test(path));

// .offline-build/fastlik-Admin/src/launch/preview-readonly-policy.ts
function previewRequestAllowed(target, method = "GET") {
  if (!serverRequestAllowed(target, method)) return false;
  if (method === "GET") return true;
  return method === "POST" && /^\/api\/(?:v1\/auth\/(?:login|logout|refresh)|admin\/auth\/(?:login|logout))$/.test(target);
}

// .offline-build/fastlik-Admin/src/preview-gateway.ts
function required(env, key) {
  const v = env[key];
  if (typeof v !== "string" || !v.trim() || v.includes("NOT_BOUND")) throw Error("PREVIEW_UNBOUND");
  return v.trim();
}
function previewBindings(env, origin) {
  if (required(env, "FASTLINK_PREVIEW_STATUS") !== "OWNER_APPROVED") throw Error("PREVIEW_UNBOUND");
  if (required(env, "FASTLINK_PREVIEW_ORIGIN") !== origin || !origin.startsWith("https://")) throw Error("PREVIEW_ORIGIN");
  const backend = required(env, "FASTLINK_BACKEND_ORIGIN");
  if (!backend.startsWith("https://") || new URL(backend).origin !== backend) throw Error("PREVIEW_BACKEND");
  const buildSha = required(env, "FASTLINK_BUILD_SHA"), snapshot = required(env, "FASTLINK_SOURCE_SNAPSHOT"), candidate = required(env, "FASTLINK_CANDIDATE_ID");
  if (!/^[0-9a-f]{40}$/i.test(buildSha) || !/^[0-9a-f]{64}$/.test(snapshot) || !/^FL-LAUNCH-B13-[0-9]{8}$/.test(candidate)) throw Error("PREVIEW_VERSION");
  const expiry = Date.parse(required(env, "FASTLINK_PREVIEW_EXPIRES_AT"));
  if (!Number.isFinite(expiry) || expiry <= Date.now() || (env.FASTLINK_PREVIEW_DEPLOYMENT_PROFILE === "B17_READONLY_MONTH_V1" ? expiry !== Date.parse(String(env.B17_RETENTION_UNTIL_UTC)) : expiry > Date.now() + 24 * 36e5)) throw Error("PREVIEW_EXPIRED");
  const proof = required(env, "FASTLINK_PREVIEW_GATEWAY_PROOF");
  if (proof.length < 48 || proof.length > 256) throw Error("PREVIEW_GATEWAY");
  const issuer = required(env, "FASTLINK_PREVIEW_ACCESS_ISSUER");
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) throw Error("PREVIEW_ACCESS");
  return { backend, buildSha, snapshot, candidate, proof, issuer, audience: required(env, "FASTLINK_PREVIEW_ACCESS_AUDIENCE") };
}
function jsonPart(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error("PREVIEW_ACCESS");
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  const v = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))));
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("PREVIEW_ACCESS");
  return v;
}
async function previewAccess(request, env) {
  const binding = previewBindings(env, new URL(request.url).origin);
  const jwt = request.headers.get("cf-access-jwt-assertion");
  if (!jwt || jwt.length > 8192) throw Error("PREVIEW_ACCESS");
  const parts = jwt.split(".");
  if (parts.length !== 3) throw Error("PREVIEW_ACCESS");
  const header = jsonPart(parts[0]), claims = jsonPart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || claims.iss !== binding.issuer || !Array.isArray(claims.aud) || !claims.aud.includes(binding.audience) || typeof claims.exp !== "number" || claims.exp <= Date.now() / 1e3 || claims.nbf !== void 0 && (typeof claims.nbf !== "number" || claims.nbf > Date.now() / 1e3)) throw Error("PREVIEW_ACCESS");
  const emails = JSON.parse(required(env, "FASTLINK_PREVIEW_ALLOWED_EMAILS_JSON"));
  if (!Array.isArray(emails) || emails.length < 1 || emails.length > 25 || typeof claims.email !== "string" || !emails.includes(claims.email)) throw Error("PREVIEW_ACCESS");
  const jwks = JSON.parse(required(env, "FASTLINK_PREVIEW_ACCESS_JWKS_JSON"));
  if (!jwks || !Array.isArray(jwks.keys) || jwks.keys.length < 1 || jwks.keys.length > 8) throw Error("PREVIEW_ACCESS");
  const keys = jwks.keys.filter((k) => k.kid === header.kid);
  if (keys.length !== 1) throw Error("PREVIEW_ACCESS");
  const key = keys[0];
  if (key.kty !== "RSA" || key.alg !== "RS256" || key.use !== "sig" || ["d", "p", "q", "dp", "dq", "qi"].some((k) => key[k] !== void 0)) throw Error("PREVIEW_ACCESS");
  const imported = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!/^[A-Za-z0-9_-]+$/.test(parts[2])) throw Error("PREVIEW_ACCESS");
  const raw = atob(parts[2].replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - parts[2].length % 4) % 4));
  const signature = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", imported, signature, new TextEncoder().encode(parts[0] + "." + parts[1]))) throw Error("PREVIEW_ACCESS");
  return binding;
}
function previewProxyHeaders(request, proof) {
  const h = new Headers(request.headers);
  for (const key of ["host", "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-fastlink-preview-gateway", "x-fastlink-api-proxy", "cf-access-jwt-assertion"]) h.delete(key);
  const cookie = h.get("cookie");
  if (cookie) h.set("cookie", cookie.split(";").filter((x) => x.trim().split("=", 1)[0] !== "CF_Authorization").join(";"));
  h.set("x-fastlink-preview-gateway", proof);
  h.set("x-forwarded-host", new URL(request.url).host);
  h.set("x-forwarded-proto", "https");
  return h;
}
async function previewProxy(request, binding) {
  const u = new URL(request.url);
  if (!previewRequestAllowed(u.pathname + u.search, request.method)) return new Response("Request unavailable", { status: 403 });
  const target = new URL(u.pathname + u.search, binding.backend);
  const response = await fetch(target, { method: request.method, headers: previewProxyHeaders(request, binding.proof), body: request.method === "GET" ? void 0 : request.body, redirect: "manual" });
  const h = new Headers(response.headers);
  h.set("cache-control", "no-store");
  h.set("x-fastlink-source-commit", binding.buildSha);
  h.set("x-fastlink-source-snapshot", binding.snapshot);
  h.set("x-fastlink-candidate-id", binding.candidate);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

import { diagnosticContext, tracedRequest, completeResponse, failureResponse } from './safe-preview-diagnostics.mjs';
export default {
    async fetch(request, env) {
        const context = diagnosticContext(request);
        try {
            const binding = await previewAccess(request, env), url = new URL(request.url);
            Object.assign(binding, adminReleaseIdentity);
            context.stage = 'WINDOW';
            const paused = windowResponse(request, env);
            if (paused)
                return completeResponse(paused, context);
            if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
                context.stage = 'UPSTREAM';
                return completeResponse(await previewProxy(tracedRequest(request, context), binding), context);
            }
            if (url.pathname === '/runtime-config.js') {
                context.stage = 'CONFIG';
                return completeResponse(new Response('window.__FASTLINK_RUNTIME__ = Object.freeze(' + JSON.stringify({ environment: 'TEST', apiUrl: '/api', buildSha: binding.buildSha }) + ');', { headers: { 'content-type': 'application/javascript', 'cache-control': 'no-store' } }), context);
            }
            if (url.pathname === '/healthz') {
                context.stage = 'HEALTH';
                return completeResponse(Response.json({ status: 'liveness', candidateId: binding.candidate, sourceCommit: binding.buildSha, sourceSnapshot: binding.snapshot, deploymentId: null, Gate1: 'NOT_PASSED', wholeProjectReady: false }), context);
            }
            context.stage = 'ASSET';
            return completeResponse(await fetchInlineAsset(request), context);
        }
        catch (error) {
            return failureResponse(error, context);
        }
    }
};
