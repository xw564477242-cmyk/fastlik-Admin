import {restoredAdminReadAllowed} from './admin-restored-read-routing'
// Product routing only. These predicates grant no database or actor permissions.
const id = '[A-Za-z0-9_-]{2,128}';
type Route = { methods: readonly string[]; path: RegExp; query?: readonly string[]; required?: readonly string[] };
const wallet: Route[] = [
  { methods: ['POST'], path: /^\/v1\/auth\/(register|login|refresh|logout)$/ },
  { methods: ['GET'], path: /^\/v1\/session$/ },
  { methods: ['GET'], path: /^\/v1\/kyc\/status$/ },
  { methods: ['GET'], path: /^\/v1\/wallet\/(assets|balances|accounts)$/ },
  { methods: ['GET'], path: /^\/v1\/wallet\/transactions$/, query: ['assetCode', 'limit', 'cursor', 'type', 'status'], required: ['assetCode'] },
  { methods: ['GET'], path: new RegExp(`^/v1/wallet/accounts/${id}/transactions$`), query: ['assetCode', 'limit', 'cursor', 'type', 'status'], required: ['assetCode'] },
  { methods: ['GET'], path: new RegExp(`^/v1/wallet/transactions/${id}$`) },
  { methods: ['GET'], path: /^\/v1\/wallet\/operations$/, query: ['limit', 'cursor', 'type', 'status'] },
  { methods: ['GET'], path: new RegExp(`^/v1/wallet/operations/${id}$`) },
  { methods: ['GET'], path: /^\/v1\/cards$/, query: ['limit', 'cursor'] },
  { methods: ['GET'], path: new RegExp(`^/v1/cards/${id}$`) },
  { methods: ['GET'], path: new RegExp(`^/v1/cards/${id}/transactions$`), query: ['limit', 'cursor', 'status'] },
  { methods: ['GET'], path: new RegExp(`^/v1/cards/${id}/transactions/${id}$`) },
];
const admin: Route[] = [
  { methods: ['POST'], path: /^\/admin\/auth\/(login|logout)$/ },
  { methods: ['GET'], path: /^\/admin\/auth\/me$/ },
  { methods: ['GET'], path: new RegExp(`^/admin/tenants/${id}/users/${id}/kyc$`), query: ['environment'], required: ['environment'] },
  { methods: ['GET'], path: new RegExp(`^/admin/tenants/${id}/users(?:/${id})?$`), query: ['environment'], required: ['environment'] },
  { methods: ['PATCH'], path: new RegExp(`^/admin/tenants/${id}/users/${id}/kyc$`) },
  { methods: ['GET'], path: new RegExp(`^/admin/tenants/${id}/cards/${id}/snapshot$`) },
  { methods: ['GET'], path: new RegExp(`^/admin/tenants/${id}/operations/card-support/[A-Za-z0-9._:-]{8,128}$`) },
  { methods: ['GET'], path: new RegExp(`^/admin/tenants/${id}/support-cases$`), query: ['traceId'], required: ['traceId'] },
  { methods: ['POST'], path: new RegExp(`^/admin/tenants/${id}/support-cases$`) },
  { methods: ['GET', 'PATCH'], path: new RegExp(`^/admin/tenants/${id}/support-cases/${id}$`) },
];
function allowed(target: string, method: string, routes: readonly Route[]): boolean {
  if (typeof target !== 'string' || target.length > 4096 || !/^[\x21-\x7e]+$/.test(target)) return false;
  const [path, query, extra] = target.split('?');
  if (extra !== undefined || /[%\\;#]/.test(path) || path.includes('//') || /\/(?:\.|\.\.)(?:\/|$)/.test(path)) return false;
  const route = routes.find(r => r.methods.includes(method) && r.path.test(path));
  if (!route) return false;
  const seen = new Set<string>();
  for (const [key, value] of new URLSearchParams(query ?? '')) {
    if (method !== 'GET' || !route.query?.includes(key) || seen.has(key) || !value) return false;
    seen.add(key);
    if (key === 'environment' && !['TEST', 'SANDBOX'].includes(value)) return false;
    if (key === 'limit' && !/^(?:[1-9][0-9]?|100)$/.test(value)) return false;
    if (key === 'assetCode' && !/^[A-Z][A-Z0-9]{1,15}$/.test(value)) return false;
    if (key === 'cursor' && !/^[A-Za-z0-9._~+/=:-]{1,2048}$/.test(value)) return false;
    if ((key === 'status' || key === 'type') && !/^[A-Z][A-Z_]{1,39}$/.test(value)) return false;
    if (key === 'traceId' && !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) return false;
  }
  return (route.required ?? []).every(key => seen.has(key));
}
export const walletRequestAllowed = (path: string, method = 'GET') => allowed(path, method, wallet);
export const adminRequestAllowed = (path: string, method = 'GET') => (allowed(path, method, admin) || restoredAdminReadAllowed(path, method));
export const walletRouteAllowed = (path: string) => ['/', '/auth', '/assets/digital', '/assets/fiat', '/assets/cards', '/history', '/kyc', '/cards'].includes(path);
export const serverRequestAllowed = (path: string, method: string) => path.startsWith('/api/')
  && (walletRequestAllowed(path.slice(4), method) || adminRequestAllowed(path.slice(4), method)
    || (method === 'GET' && /^\/api\/health(?:\/readiness)?$/.test(path)));
