# Lovable Admin digital-asset source export

This directory is a review-only source snapshot exported through the official Lovable project file API.
It is not compiled into FastLink Admin and has not been deployed.

- Lovable project: `2d477529-f2d4-4ccd-8340-ac0b159e489b`
- Project URL: <https://lovable.dev/projects/2d477529-f2d4-4ccd-8340-ac0b159e489b>
- Exact Lovable source commit: `42f197789693c83cf3c73f69926ce4b0abd263ca`
- FastLink Admin base: `origin/dev` at `3214d13`
- Scope: digital-asset-aware Admin surfaces and their directly required UI primitives only

## Included

The snapshot includes the digital-asset feature note, shared Admin primitives, chain/nav metadata, and the relevant tenants, products, Card Center, funds, treasury, ledger, end-user, chain configuration, and hot-wallet route sources.

## Intentionally excluded

- `.env` and all credentials
- Supabase configuration, database files, and migrations
- MCP/Connector sources and manifests
- binary assets and generated build output
- unrelated Lovable pages and components

The source contains SANDBOX mock presentation logic. It must not be treated as a live API implementation. The reviewed read-only mapping to FastLink's existing contracts is maintained in `src/lovableAdminContractMap.ts`; missing Backend contracts remain explicitly blocked.

`SECURITY.md` records the final Lovable security result. `SHA256SUMS` records every included source file and the evidence documents. Verify it from the repository root with `shasum -a 256 -c docs/lovable-export/42f19778/SHA256SUMS`.
