---
name: FastLink 数字资产融合规则
description: 虚拟U卡/实体卡为核心业务，USDT充提为配套链路；mock 数据、费率上限、分润与融合式 UI 规则
type: feature
---
核心业务：虚拟 U 卡与实体卡发行。数字资产（USDT 充提）只是配套资金链路，
绝不做独立割裂的 Web3 页面 / 顶级“数字资产”菜单 —— 所有能力融合进原有模块：
- 发卡与费率配置 → 产品详情页第一个 Tab（卡片类型、开卡费、月费、公链、各项手续费、推荐分润）
- 开卡申请 + 卡片详情（USDT 充值 / 卡消费 / 取现 / 第三方支付 / 推荐分润 Tab）→ `/admin/card-center`
- USDT 总账、充值/提现/消费流水、分润对账 → `/admin/funds` 的 Tab
- 租户级 USDT 开关、费率倍率上限、分润开关 → 租户详情“已开通能力”Tab
- 仅新增 2 个子页面，归入资金与对账：`/admin/chain-config`、`/admin/hot-wallets`

统一组件（`src/components/admin/digital-asset-fields.tsx`）：
ChainSelect / ChainToggles（全局公链选择）、CopyableText（Hash 与钱包地址一键复制）、
RateField（必须显示平台上限，超限标红）、SwitchField、FormSection。
表格用 `src/components/admin/mock-table.tsx` 的 MockTable（含 loading/empty/error 回退）。

费率上限集中在 `src/lib/admin-chains.ts` 的 FEE_CAPS；租户不得超过平台上限，
分润记录超限标记 BREACH。USDT 与法币不得直接相加。

数据全部为 mock 预览（`src/lib/admin-chains.ts`、TENANTS），不对接任何真实后端接口。
原有全部菜单、页面、路由必须完整保留，只做扩展。
