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

后续现权内读取增量：品牌基础字段、产品分页/真正详情、非认证审计/详情/Trace、源码合同图/页面关联、真正证据详情已接入候选。角色目录/成员/权限页与Session分列；缺专项列权/RLS时明确失败，未改实际授权。新增管理组件共16项受校验源文件，沿原固定发布通道，临时白名单仍未恢复。13项管理任务Mock通过，不作为已部署验证。仍不合并、不部署、不动钱包或现有后端。

本轮补充固定TEST租户的合成样本披露，人工零值与拒绝记录均不表示Provider实况或自然交易；未改布局、登录状态、Access或运行租期。后端商户同时间戳分页新增唯一ID排序，离线回归3/3；首次TS7006失败单列保留。源码与样本候选、实际数据库和已部署版本继续分列。
