// Only these public fields may leave the Worker. Never serialize an error/request/env.
const METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']);
const STAGES = new Set(['ACCESS', 'WINDOW', 'UPSTREAM', 'ASSET', 'CONFIG', 'HEALTH']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ROUTES = [
  [/^\/api\/v1\/auth\/(login|logout|refresh)$/, '/api/v1/auth/:action'],
  [/^\/api\/admin\/auth\/(login|logout|me)$/, '/api/admin/auth/:action'],
  [/^\/api\/v1\/cards$/, '/api/v1/cards'],
  [/^\/api\/v1\/cards\/[^/]+$/, '/api/v1/cards/:cardId'],
  [/^\/api\/v1\/cards\/[^/]+\/transactions(?:\/[^/]+)?$/, '/api/v1/cards/:cardId/transactions/:optionalId'],
  [/^\/api\/admin\/tenants\/[^/]+\/cards\/[^/]+\/snapshot$/, '/api/admin/tenants/:tenantId/cards/:cardId/snapshot'],
  [/^\/api\/admin\/tenants\/[^/]+\/users(?:\/[^/]+)?(?:\/kyc)?$/, '/api/admin/tenants/:tenantId/users/:optionalId/:optionalKyc'],
  [/^\/api\/admin\/tenants\/[^/]+\/support-cases(?:\/[^/]+)?$/, '/api/admin/tenants/:tenantId/support-cases/:optionalId'],
  [/^\/api\/health(?:\/readiness)?$/, '/api/health/:optionalReadiness'],
  [/^\/(?:api\/v1\/(?:session|kyc\/status|wallet\/(?:assets|balances|accounts|transactions|operations)))$/, '/api/v1/:readOnlyRoute'],
  [/^\/(?:runtime-config\.js|healthz)$/, '/:publicConfiguration'],
];
export function safePath(url) {
  try { const path = new URL(url).pathname; return ROUTES.find(([pattern]) => pattern.test(path))?.[1] ?? '/[REDACTED]'; }
  catch { return '/[INVALID]'; }
}
export function diagnosticContext(request, randomUUID = () => crypto.randomUUID()) {
  const supplied = request.headers.get('x-trace-id');
  const generated = supplied && UUID.test(supplied) ? supplied : randomUUID();
  if (!UUID.test(generated)) throw new Error('DIAGNOSTIC_TRACE_INVALID');
  return { stage: 'ACCESS', method: METHODS.has(request.method) ? request.method : 'OTHER', path: safePath(request.url), traceId: generated };
}
export function tracedRequest(request, context) {
  const headers = new Headers(request.headers); headers.set('x-trace-id', context.traceId);
  return new Request(request, { headers });
}
function record(context, category, status, emit) {
  const entry = { type: 'PREVIEW_REQUEST_RESULT', stage: STAGES.has(context.stage) ? context.stage : 'UNKNOWN',
    method: METHODS.has(context.method) ? context.method : 'OTHER', path: context.path,
    traceId: UUID.test(context.traceId) ? context.traceId : null,
    httpStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null, category };
  try { emit(JSON.stringify(entry)); } catch { /* Logging failure cannot bypass the response boundary. */ }
}
export function completeResponse(response, context, emit = value => console.log(value)) {
  const status = response.status;
  const category = status === 0 ? 'HTTP_STATUS_UNAVAILABLE' : status >= 400 ? 'HTTP_REJECTED' : 'HTTP_RESPONSE';
  record(context, category, status, emit);
  const headers = new Headers(response.headers); headers.set('x-trace-id', context.traceId);
  return new Response(response.body, { status, statusText: response.statusText, headers });
}
export function failureResponse(_error, context, emit = value => console.log(value)) {
  const category = context.stage === 'ACCESS' ? 'ACCESS_OR_BINDING_REJECTED' : context.stage === 'UPSTREAM' ? 'UPSTREAM_TRANSPORT_UNAVAILABLE' : 'PREVIEW_HANDLER_UNAVAILABLE';
  record(context, category, 503, emit);
  return new Response('Preview unavailable', { status: 503, headers: { 'cache-control': 'no-store', 'x-trace-id': context.traceId } });
}
