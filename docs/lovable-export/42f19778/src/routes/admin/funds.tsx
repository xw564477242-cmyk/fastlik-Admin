import { createFileRoute } from "@tanstack/react-router";
import {
  DataTableShell,
  FilterBar,
  PageHeader,
  Panel,
  StatusBadge,
  TablePagination,
} from "@/components/admin/primitives";
import { PageMetaBar } from "@/components/admin/page-meta";
import { PendingBackendState } from "@/components/admin/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STATUS_FILTER_OPTIONS } from "@/lib/admin-status";
import { useAdminSession } from "@/components/admin/admin-session";
import { MockMetric, MockTable } from "@/components/admin/mock-table";
import { ChainSelect, CopyableText } from "@/components/admin/digital-asset-fields";
import {
  MOCK_DEPOSITS,
  MOCK_REFERRALS,
  MOCK_SPEND,
  MOCK_USDT_BALANCES,
  MOCK_WITHDRAWALS,
  RANGE_OPTIONS,
  CARD_FILTER_OPTIONS,
  CARD_FORM_OPTIONS,
  TENANT_FILTER_OPTIONS,
  TX_TYPE_OPTIONS,
  chainLabel,
  statusTone,
} from "@/lib/admin-chains";

export const Route = createFileRoute("/admin/funds")({
  head: () => ({
    meta: [
      { title: "资金结构与账户体系 · FastLink Admin" },
      { name: "description", content: "FastLink 资金结构与账户体系。" },
    ],
  }),
  component: FundsPage,
});

function FundsPage() {
  const { scopeKey } = useAdminSession();
  return (
    <div key={scopeKey} className="space-y-4">
      <PageHeader
        titleZh="资金结构与账户体系"
        titleEn="Fund Structure & Accounts"
        description="客户资金、Tenant 资金、平台资金、备付金、Sponsor Bank 账户、Provider 清算账户、商户待结算资金与手续费收入的层级视图。"
      />
      <PageMetaBar source="GET /api/admin/funds/accounts" />

      <Tabs defaultValue="fiat">
        <TabsList data-testid="funds-tabs" className="flex-wrap">
          <TabsTrigger value="fiat" data-testid="funds-tab-fiat">资金账户结构 Accounts</TabsTrigger>
          <TabsTrigger value="usdt" data-testid="funds-tab-usdt">USDT 总账 Digital asset</TabsTrigger>
          <TabsTrigger value="deposits" data-testid="funds-tab-deposits">充值流水 Deposits</TabsTrigger>
          <TabsTrigger value="withdrawals" data-testid="funds-tab-withdrawals">提现与取现 Withdrawals</TabsTrigger>
          <TabsTrigger value="spend" data-testid="funds-tab-spend">消费流水 Spending</TabsTrigger>
          <TabsTrigger value="referral" data-testid="funds-tab-referral">分润对账 Referral</TabsTrigger>
        </TabsList>

        <TabsContent value="fiat" className="mt-4 space-y-4">
      <Panel title="资金账户结构 / Fund account structure" testId="panel-funds">
        <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">不同币种不得直接相加；跨币种合计必须标明结算币种、汇率来源与汇率时间。</p>
        <FilterBar
          testId="funds-filter"
          searchPlaceholder="搜索 / Trace ID"
          filters={[{ id: "accountType", label: "账户类型 Account type", options: [{ value: "customer-funds", label: "Customer funds" }, { value: "tenant-funds", label: "Tenant funds" }, { value: "platform-funds", label: "Platform funds" }, { value: "reserve", label: "Reserve" }, { value: "sponsor-bank-account", label: "Sponsor bank account" }, { value: "provider-settlement-account", label: "Provider settlement account" }, { value: "merchant-payable", label: "Merchant payable" }, { value: "fee-income", label: "Fee income" }, { value: "frozen-funds", label: "Frozen funds" }, { value: "in-transit-funds", label: "In-transit funds" }, { value: "settlement-account", label: "Settlement account" }] }, { id: "currency", label: "币种 Currency", options: [{ value: "sgd", label: "SGD" }, { value: "usd", label: "USD" }, { value: "hkd", label: "HKD" }, { value: "eur", label: "EUR" }] }, { id: "status", label: "状态 Status", options: STATUS_FILTER_OPTIONS }]}
          onRefresh={() => {}}
        />
        <DataTableShell
          testId="funds-table"
          columns={["账户类型 Account type", "Tenant", "提供商 Provider", "银行 Bank", "币种 Currency", "Available", "Current", "Pending", "Frozen", "In Transit", "Settled", "业务日期 Date"]}
          state={<PendingBackendState endpoint="GET /api/admin/funds/accounts" />}
        />
        <TablePagination testId="funds-pagination" />
      </Panel>
      <Panel title="跨币种合计 / Cross-currency total" testId="panel-funds-fx-total">
        <DataTableShell
          testId="funds-fx-total-table"
          columns={["结算币种 Settlement currency", "汇率来源 FX source", "汇率时间 FX timestamp", "合计 Total", "状态 Status"]}
          state={<PendingBackendState endpoint="GET /api/admin/funds/cross-currency-total" />}
        />
        <TablePagination testId="funds-fx-total-pagination" />
      </Panel>
        </TabsContent>

        <TabsContent value="usdt" className="mt-4 space-y-4">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MockMetric testId="metric-usdt-available" labelZh="平台 USDT 可用余额" labelEn="Available USDT" value="647,522.98" hint="按公链拆分见下表" />
            <MockMetric testId="metric-usdt-frozen" labelZh="平台 USDT 冻结余额" labelEn="Frozen USDT" value="17,400.00" hint="风控冻结与待清算" />
            <MockMetric testId="metric-usdt-transit" labelZh="在途 USDT" labelEn="In transit" value="4,300.50" hint="链上确认中" />
            <MockMetric testId="metric-usdt-fee" labelZh="当日手续费收入" labelEn="Fee income (today)" value="66.40" hint="USDT 充值 + 提币手续费" />
          </section>
          <Panel title="USDT 总账（按公链拆分） / USDT ledger by chain" testId="panel-usdt-ledger">
            <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">USDT 与法币不得直接相加；兑换法币金额以充值时点汇率记账。以下为 mock 预览数据。</p>
            <MockTable
              testId="usdt-ledger-table"
              minWidth={900}
              columns={["公链 Chain", "可用余额 Available", "冻结余额 Frozen", "在途 In transit", "热钱包数 Wallets", "状态 Status"]}
              rows={MOCK_USDT_BALANCES}
              rowKey={(r) => r.chain}
              renderRow={(r) => [
                chainLabel(r.chain),
                <span className="num">{r.available}</span>,
                <span className="num">{r.frozen}</span>,
                <span className="num">{r.inTransit}</span>,
                <span className="num">{r.wallets}</span>,
                <StatusBadge label={r.status} tone={statusTone(r.status)} />,
              ]}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="deposits" className="mt-4 space-y-4">
          <Panel title="USDT 充值流水 / USDT deposits" testId="panel-usdt-deposits">
            <FilterBar
              testId="usdt-deposits-filter"
              searchPlaceholder="Hash / 卡 ID / 充值单号"
              filters={[
                { id: "tenant", label: "租户 Tenant", options: TENANT_FILTER_OPTIONS },
                { id: "type", label: "交易类型 Type", options: TX_TYPE_OPTIONS },
                { id: "card", label: "卡片编号 Card ID", options: CARD_FILTER_OPTIONS },
                { id: "cardForm", label: "卡形态 Card form", options: CARD_FORM_OPTIONS },
                { id: "range", label: "时间范围 Range", options: RANGE_OPTIONS },
                { id: "status", label: "状态 Status", options: STATUS_FILTER_OPTIONS },
              ]}
              onRefresh={() => {}}
              extra={<ChainSelect includeAll testId="usdt-deposits-filter-chain" />}
            />
            <MockTable
              testId="usdt-deposits-table"
              minWidth={1320}
              columns={["时间 Time", "充值单号 ID", "租户 Tenant", "卡片 Card", "公链 Chain", "交易 Hash", "USDT 金额", "汇率 Rate", "手续费 Fee", "兑换法币 Fiat", "状态 Status"]}
              rows={MOCK_DEPOSITS}
              rowKey={(d) => d.id}
              renderRow={(d) => [
                <span className="num text-xs">{d.time}</span>,
                d.id,
                d.tenant,
                d.card,
                chainLabel(d.chain),
                <CopyableText value={d.hash} testId={`funds-deposit-hash-${d.id}`} label="交易 Hash" />,
                <span className="num">{d.usdt}</span>,
                <span className="num">{d.rate}</span>,
                <span className="num">{d.fee}</span>,
                <span className="num">{d.fiat} {d.currency}</span>,
                <StatusBadge label={d.status} tone={statusTone(d.status)} />,
              ]}
            />
            <TablePagination testId="usdt-deposits-pagination" total={MOCK_DEPOSITS.length} />
          </Panel>
        </TabsContent>

        <TabsContent value="withdrawals" className="mt-4 space-y-4">
          <Panel title="提现流水 / Withdrawals & cash-out" testId="panel-usdt-withdrawals">
            <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">数字资产提币与银行卡取现合并展示，手续费单独成列。</p>
            <FilterBar
              testId="usdt-withdrawals-filter"
              searchPlaceholder="Hash / 卡 ID / 提现单号"
              filters={[
                { id: "tenant", label: "租户 Tenant", options: TENANT_FILTER_OPTIONS },
                { id: "type", label: "交易类型 Type", options: TX_TYPE_OPTIONS },
                { id: "card", label: "卡片编号 Card ID", options: CARD_FILTER_OPTIONS },
                { id: "cardForm", label: "卡形态 Card form", options: CARD_FORM_OPTIONS },
                { id: "range", label: "时间范围 Range", options: RANGE_OPTIONS },
                { id: "status", label: "状态 Status", options: STATUS_FILTER_OPTIONS },
              ]}
              onRefresh={() => {}}
              extra={<ChainSelect includeAll testId="usdt-withdrawals-filter-chain" />}
            />
            <MockTable
              testId="usdt-withdrawals-table"
              minWidth={1260}
              columns={["时间 Time", "单号 ID", "类型 Type", "租户 Tenant", "卡片 Card", "公链 Chain", "交易 Hash", "金额 Amount", "手续费 Fee", "到账 Net", "状态 Status"]}
              rows={MOCK_WITHDRAWALS}
              rowKey={(w) => w.id}
              renderRow={(w) => [
                <span className="num text-xs">{w.time}</span>,
                w.id,
                w.kind,
                w.tenant,
                w.card,
                w.chain === "-" ? "—" : chainLabel(w.chain),
                <CopyableText value={w.hash} testId={`funds-withdraw-hash-${w.id}`} label="交易 Hash" />,
                <span className="num">{w.amount}</span>,
                <span className="num">{w.fee}</span>,
                <span className="num">{w.net}</span>,
                <StatusBadge label={w.status} tone={statusTone(w.status)} />,
              ]}
            />
            <TablePagination testId="usdt-withdrawals-pagination" total={MOCK_WITHDRAWALS.length} />
          </Panel>
        </TabsContent>

        <TabsContent value="spend" className="mt-4 space-y-4">
          <Panel title="消费流水 / Card & third-party spending" testId="panel-usdt-spend">
            <FilterBar
              testId="usdt-spend-filter"
              searchPlaceholder="交易 ID / 商户 / 卡 ID"
              filters={[
                { id: "tenant", label: "租户 Tenant", options: TENANT_FILTER_OPTIONS },
                { id: "type", label: "交易类型 Type", options: TX_TYPE_OPTIONS },
                { id: "card", label: "卡片编号 Card ID", options: CARD_FILTER_OPTIONS },
                { id: "cardForm", label: "卡形态 Card form", options: CARD_FORM_OPTIONS },
                { id: "range", label: "时间范围 Range", options: RANGE_OPTIONS },
                { id: "status", label: "状态 Status", options: STATUS_FILTER_OPTIONS },
              ]}
              onRefresh={() => {}}
              extra={<ChainSelect includeAll testId="usdt-spend-filter-chain" />}
            />
            <MockTable
              testId="usdt-spend-table"
              minWidth={1120}
              columns={["时间 Time", "交易 ID", "渠道 Channel", "租户 Tenant", "卡片 Card", "商户 / 应用", "金额 Amount", "手续费 Fee", "状态 Status"]}
              rows={MOCK_SPEND}
              rowKey={(s) => s.id}
              renderRow={(s) => [
                <span className="num text-xs">{s.time}</span>,
                s.id,
                s.channel,
                s.tenant,
                s.card,
                s.merchant,
                <span className="num">{s.amount} {s.currency}</span>,
                <span className="num">{s.fee}</span>,
                <StatusBadge label={s.status} tone={statusTone(s.status)} />,
              ]}
            />
            <TablePagination testId="usdt-spend-pagination" total={MOCK_SPEND.length} />
          </Panel>
        </TabsContent>

        <TabsContent value="referral" className="mt-4 space-y-4">
          <Panel title="推荐分润对账报表 / Referral commission reconciliation" testId="panel-referral-recon">
            <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">上级 – 下级分润金额、费率与边界校验；超过上限的记录标记为 BREACH 并阻止结算。</p>
            <FilterBar
              testId="referral-recon-filter"
              searchPlaceholder="上级 / 下级 / 分润单号"
              filters={[
                { id: "tenant", label: "租户 Tenant", options: TENANT_FILTER_OPTIONS },
                { id: "type", label: "交易类型 Type", options: TX_TYPE_OPTIONS },
                { id: "card", label: "卡片编号 Card ID", options: CARD_FILTER_OPTIONS },
                { id: "cardForm", label: "卡形态 Card form", options: CARD_FORM_OPTIONS },
                { id: "range", label: "时间范围 Range", options: RANGE_OPTIONS },
              ]}
              onRefresh={() => {}}
              extra={<ChainSelect includeAll testId="referral-recon-filter-chain" />}
            />
            <MockTable
              testId="referral-recon-table"
              minWidth={1280}
              columns={["时间 Time", "分润单号 ID", "租户 Tenant", "上级 Upline", "下级 Downline", "来源 Source", "基数 Base", "费率 Rate", "上限 Cap", "分润金额 Amount", "边界校验 Boundary"]}
              rows={MOCK_REFERRALS}
              rowKey={(r) => r.id}
              renderRow={(r) => [
                <span className="num text-xs">{r.time}</span>,
                r.id,
                r.tenant,
                r.upline,
                r.downline,
                r.source,
                <span className="num">{r.base}</span>,
                <span className="num">{r.rate}</span>,
                <span className="num">{r.cap}</span>,
                <span className="num">{r.amount} {r.currency}</span>,
                <StatusBadge label={r.breach ? "超出上限 BREACH" : "合规 OK"} tone={r.breach ? "danger" : "success"} />,
              ]}
            />
            <TablePagination testId="referral-recon-pagination" total={MOCK_REFERRALS.length} />
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
