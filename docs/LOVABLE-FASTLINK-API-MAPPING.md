# Lovable Admin to FastLink API contract mapping

## Scope and safety boundary

This document maps the Lovable digital-asset Admin prototype at commit `42f197789693c83cf3c73f69926ce4b0abd263ca` to the existing FastLink Admin/Backend read contracts on `origin/dev` at `3214d13`.

Only relative, authenticated FastLink API paths are represented. The executable resolver permits `SANDBOX` and `TEST` only, emits `GET` only, encodes tenant/card identifiers, and rejects incomplete lookup context. No MCP, Connector, provider URL, external API, write action, migration, secret, production configuration, or fallback mock transport is introduced.

## Mapping

| Lovable surface | Status | FastLink read contract | Deferred / blocked |
|---|---|---|---|
| `/admin/tenants` | Connected read-only | `GET /admin/tenants` | None for list |
| `/admin/tenants/$tenantId` | Partial read-only | Tenant detail and integration readiness | Digital-asset capability and tenant fee-limit writes |
| `/admin/card-center` | Partial read-only | Card snapshot, balance, limits, timeline, transactions | Card creation, template assignment, fee override writes |
| `/admin/funds` | Partial read-only | Wallet operations and wallet transactions | Fund movement writes; digital-asset fee/referral settlement detail |
| `/admin/treasury` | Connected read-only | Liquidity, reconciliation, settlement trial balance, daily closing | None for represented panels |
| `/admin/ledger` | Partial read-only | Ledger accounts, journals, trial balance | Digital-asset fee/referral journal drill-down |
| `/admin/end-users` | Partial read-only | Per-user KYC lookup | End-user list and digital-asset wallet detail |
| `/admin/products/$productId` | Backend contract missing | None | Product catalogue and digital-asset product configuration |
| `/admin/chain-config` | Backend contract missing | None | Chain configuration read/write |
| `/admin/hot-wallets` | Backend contract missing | None | Hot-wallet inventory and balances |

## Activation rule

The Lovable files under `docs/lovable-export/42f19778/` are evidence and review inputs, not runtime code. Activating redesigned pages requires a separate, surface-specific implementation PR with contract schemas, mounted lifecycle tests, session/tenant/environment isolation tests, CI, secret scanning, and DEV-only deployment evidence. Missing contracts must continue to fail closed; they must not silently use mock data on connection failure.
