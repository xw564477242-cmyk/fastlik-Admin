# THR-001～THR-008 Admin Regression Evidence

- Scope: FastLink Admin cross-platform alignment
- Data sources: Sandbox / Official UAT / Production
- Mock fallback: prohibited
- Authentication: real `/admin/auth/login` Bearer session only
- Authorization: UI read/write gate plus backend `AdminBearerGuard`; backend remains authoritative
- Audit: every write calls an authenticated backend command with the real actor; backend Audit Log is the acceptance record

## Implemented Admin surfaces

1. Thredd Partner Configuration and configurable X-Region (`0 Default`, `1 EMEA`, `2 APAC`).
2. Secret-safe identity, certificate metadata, Discovery and host readiness.
3. Card Product Mapping: partner, BIN/Sub-BIN, product, type, scheme/network, Control Groups, 3DS, MultiFX and Network Sharing default.
4. Cardholder Management by `publicToken` only, including masked card details, status, available/current/pending balances and product mapping.
5. Independent Card Holder, Address, Fulfilment, Manufacturing, `Config3DSecure`, Privacy and Design update with strict `204 No Content` handling.
6. Card Production Center and Design Library for Emboss, Carrier, Thermal, Language, Vanity and Image metadata.
7. MVC parent/child mapping and freeze/unfreeze controls with GUID idempotency keys.
8. Explicit Sandbox / Official UAT / Production markings and no UAT-to-Sandbox fallback.

## Security assertions

- No full PAN, CVV, PIN, access token, KID secret, certificate material, private key, Control Group internal ID, SSA or Registration Access Token is collected or rendered.
- Access tokens and passwords are not stored in `localStorage` or `sessionStorage`.
- Users without `admin:read` receive an RBAC denial before Thredd data loads.
- Users without `admin:write` receive an RBAC denial before any mutation request is sent.
- HTTP 401/403/404/500 remain visible errors; no Mock or alternate data-source retry is performed.

## Automated result

Run:

```text
npm run lint
npm run build
npm test
```

The Admin E2E contract verifies 25 UI/API requirements, 5 sensitive-data prohibitions and 5 RBAC matrix cases. Build verifies the complete TypeScript and Vite bundle.

## Live environment blockers

- `GET/PUT /admin/tenants/:tenantId/integrations/thredd/configuration` must be supplied by the Backend line and return only secret-safe metadata.
- Partner Card Product DTO/response must expose Sub-BIN, Control Groups, 3DS, MultiFX and Network Sharing fields for full persistence.
- Live Official UAT E2E remains `BLOCKED` until a real UAT tenant, official Thredd scope, credentials and certificates are configured.
- A live Audit Log read endpoint is not currently exposed to Admin; write operations are audited server-side, but the final UAT evidence must be retrieved from backend evidence/trace storage.
