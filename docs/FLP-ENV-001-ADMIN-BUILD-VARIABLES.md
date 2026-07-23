# FLP-ENV-001 — Admin Build Variables

| Variable Name | Environment | Required | Secret | Source | Current Value Status | Used By | Last Verified | Owner |
|---|---|---:|---:|---|---|---|---|---|
| `VITE_FASTLINK_API_URL` | ALL | Yes | No | Build platform | NEEDS_DEPLOYMENT_CONFIGURATION | `runtimeConfig.ts`, `productionApi.ts` | 2026-07-23 | DevOps |
| `VITE_FASTLINK_ENVIRONMENT` | ALL | Yes | No | Build platform | NEEDS_DEPLOYMENT_CONFIGURATION | `runtimeConfig.ts`, `Root.tsx` | 2026-07-23 | DevOps |
| `VITE_FASTLINK_BUILD_SHA` | ALL | Yes | No | CI commit SHA | NEEDS_CI_CONFIGURATION | deployment metadata | 2026-07-23 | DevOps |

## Enforcement

- API base is immutable after build and requests ignore any UI-supplied URL.
- Production requires HTTPS.
- Build environment is locked; other environment buttons are disabled.
- Authenticated session environment must equal the build environment.
- API failures clear loaded server data and expose HTTP status and Trace ID.
- No mock fallback exists in the production API client.
