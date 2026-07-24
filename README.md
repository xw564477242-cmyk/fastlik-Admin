# FastLink Admin

FastLink Payment 正式运营后台。保留完整多租户 SaaS 菜单与页面结构，全部可用数据来自固定的 Railway Backend。

## 本地运行

```bash
npm install
npm run dev
```

## 当前模块

- 运营总览
- 用户与 KYC
- 钱包与资金账户
- 卡片管理
- Card Center（真实卡片详情、冻结/解冻、余额及生命周期）
- 交易管理
- 资金池与清算
- Treasury / Settlement / Risk Dashboard
- Role Management（真实 Session Roles / Permissions；管理接口未提供时显示 Unavailable）
- Merchant / Testing（真实商户与支付数据）
- Card History 生命周期审计入口
- Tokenization
- 风控中心
- 系统与权限

生产构建必须提供 `VITE_FASTLINK_API_URL` 与 `VITE_FASTLINK_ENVIRONMENT`。API Base 在构建时锁定；管理员密码与 Bearer Session 不写入 `localStorage` 或 `sessionStorage`。任何 API 失败都会清空旧页面响应并显示 HTTP/Trace 错误，不生成替代记录。
