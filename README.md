# FastLink Admin

FastLink Payment 运营后台第一版。

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
- Sprint-06 Card Center（虚拟卡、实体卡、详情、冻结、余额、PIN、CVV、交易）
- 交易管理
- 资金池与清算
- Treasury / Settlement / Risk / Card / Transaction / Webhook Dashboard
- Tokenization
- 风控中心
- 系统与权限

Sprint-06 自带可重复生成的 UAT 演示数据：1,000 个用户、10,000 笔交易、100 张虚拟卡与实体卡，并覆盖 USD、EUR、GBP、MYR、SGD、USDT。Card Center 可在 Demo 与 Railway Sandbox 间切换，API Key 只保存在当前浏览器会话。

验收说明见 [`docs/SPRINT-06-CARD-ADMIN-ACCEPTANCE.md`](docs/SPRINT-06-CARD-ADMIN-ACCEPTANCE.md)。
