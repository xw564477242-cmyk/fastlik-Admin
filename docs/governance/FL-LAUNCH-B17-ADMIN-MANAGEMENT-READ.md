# FL-LAUNCH-B17 Admin management flow continuation

Base: 675f79f61cb1031dc52cff8116a4a7966060f58d. Existing Draft PR #61 → dev; not a final Admin acceptance or new cloud publication.

- Connects the existing user list/detail and selected user→KYC flow using five scoped public fields, without PII placeholders or permission changes.
- Replaces local clients/events slicing with backend paging/total and fresh detail requests; event/evidence Trace navigation is explicit. Evidence row summary is labelled as such, not an independent detail endpoint.
- Merchant detail→filtered payment history→fresh payment/related merchant and support case query→fresh case detail/linked minimal audit are wired. Create/manage/funds/Provider controls remain disabled.
- Filter/token/tenant scopes invalidate stale responses. Support query distinguishes not requested, actual empty and error; it never creates substitute records.
- Release helper is only a candidate bound to existing Worker version ec168384-9a64-47d0-a9a2-287b147454ce. No temporary environment rule is recreated and no release dispatched by this delivery.

Validation: app TypeScript PASS, Vite build PASS (existing classic runtime-config script warning retained), 6 new mounted management-flow cases plus2 affected existing route cases PASS. All are synthetic offline tests; server paging/positive detail UI on the deployed candidate remains pending.

No database/ACL/fixture/credential/Access/lease/Wallet mutation. Backend stays running. Rollback requires reviewed additive revert and separately approved publication, never restoring old identities or rewriting Git history.

首轮自然 CI 40338224247 的旧 KYC 契约检测到通用 `user` 名称重新出现并失败。保留该失败及原检测；将新增五字段读取明确命名为 `adminUsers` / `adminUserDirectoryDetail`，同步组件和 Mock，未放宽旧 KYC 预期、读取字段或权限。修订验证与新 HEAD 自然 CI 分列，不手动重跑。
