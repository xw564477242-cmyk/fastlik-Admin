import { createFileRoute } from "@tanstack/react-router";
import {
  DataTableShell,
  FilterBar,
  PageHeader,
  Panel,
  TablePagination,
} from "@/components/admin/primitives";
import { PageMetaBar } from "@/components/admin/page-meta";
import { PendingBackendState } from "@/components/admin/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STATUS_FILTER_OPTIONS } from "@/lib/admin-status";
import { useAdminSession } from "@/components/admin/admin-session";
import { MockTable } from "@/components/admin/mock-table";
import { ChainSelect } from "@/components/admin/digital-asset-fields";
import { StatusBadge } from "@/components/admin/primitives";
import { MOCK_USDT_BALANCES, chainLabel, statusTone } from "@/lib/admin-chains";

export const Route = createFileRoute("/admin/ledger")({
  head: () => ({
    meta: [
      { title: "账本与会计中心 · FastLink Admin" },
      { name: "description", content: "FastLink 账本与会计中心。" },
    ],
  }),
  component: LedgerPage,
});

function LedgerPage() {
  const { scopeKey } = useAdminSession();
  return (
    <div key={scopeKey} className="space-y-4">
      <PageHeader
        titleZh="账本与会计中心"
        titleEn="Ledger & Accounting Center"
        description="科目表、Journal、Journal Entry、借贷方向、资产负债与收入费用；支持 Tenant 与 Provider 子账本。"
      />
      <PageMetaBar source="GET /api/admin/ledger/accounts" />
      <Tabs defaultValue="accounts">
        <TabsList data-testid="ledger-tabs">
          <TabsTrigger value="accounts" data-testid="ledger-tab-accounts">科目表 Chart of accounts</TabsTrigger>
          <TabsTrigger value="journals" data-testid="ledger-tab-journals">Journal</TabsTrigger>
          <TabsTrigger value="entries" data-testid="ledger-tab-entries">Journal Entry</TabsTrigger>
          <TabsTrigger value="trial" data-testid="ledger-tab-trial">试算平衡 Trial balance</TabsTrigger>
          <TabsTrigger value="pnl" data-testid="ledger-tab-pnl">收入与费用 P&L</TabsTrigger>
          <TabsTrigger value="digital" data-testid="ledger-tab-digital">数字资产维度 Digital asset</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="mt-4 space-y-4">
          <Panel title="科目表 / Chart of accounts" testId="panel-ledger-accounts">
            <DataTableShell
              testId="ledger-accounts-table"
              columns={["科目 Account", "科目类型 Type", "资产 / 负债 Class", "币种 Currency", "Tenant 子账本", "Provider 子账本", "状态 Status"]}
              state={<PendingBackendState endpoint="GET /api/admin/ledger/accounts" />}
            />
            <TablePagination testId="ledger-accounts-pagination" />
          </Panel>
        </TabsContent>
        <TabsContent value="journals" className="mt-4 space-y-4">
          <Panel title="Journal" testId="panel-ledger-journals">
            <FilterBar
              testId="ledger-journals-filter"
              searchPlaceholder="搜索 / Trace ID"
              filters={[{ id: "status", label: "状态 Status", options: STATUS_FILTER_OPTIONS }]}
              onRefresh={() => {}}
            />
            <DataTableShell
              testId="ledger-journals-table"
              columns={["Journal ID", "业务日期 Business date", "会计日期 Accounting date", "来源 Source", "条目数 Entries", "状态 Status", "Trace ID"]}
              state={<PendingBackendState endpoint="GET /api/admin/ledger/journals" />}
            />
            <TablePagination testId="ledger-journals-pagination" />
          </Panel>
        </TabsContent>
        <TabsContent value="entries" className="mt-4 space-y-4">
          <Panel title="Journal Entry" testId="panel-ledger-entries">
            <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">UI 不提供直接修改账本余额的功能；账本记录与交易详情可双向跳转。</p>
            <DataTableShell
              testId="ledger-entries-table"
              columns={["Entry ID", "科目 Account", "借贷方向 Dr/Cr", "金额 Amount", "币种 Currency", "Tenant", "Provider", "关联交易 Transaction", "Trace ID"]}
              state={<PendingBackendState endpoint="GET /api/admin/ledger/entries" />}
            />
            <TablePagination testId="ledger-entries-pagination" />
          </Panel>
        </TabsContent>
        <TabsContent value="trial" className="mt-4 space-y-4">
          <Panel title="试算平衡 / Trial balance" testId="panel-ledger-trial">
            <DataTableShell
              testId="ledger-trial-table"
              columns={["科目 Account", "借方 Debit", "贷方 Credit", "净额 Net", "币种 Currency", "业务日期 Date"]}
              state={<PendingBackendState endpoint="GET /api/admin/ledger/trial-balance" />}
            />
            <TablePagination testId="ledger-trial-pagination" />
          </Panel>
        </TabsContent>
        <TabsContent value="pnl" className="mt-4 space-y-4">
          <Panel title="收入与费用 / Income & expense" testId="panel-ledger-pnl">
            <DataTableShell
              testId="ledger-pnl-table"
              columns={["科目 Account", "类型 Type", "金额 Amount", "币种 Currency", "会计期间 Period", "Tenant"]}
              state={<PendingBackendState endpoint="GET /api/admin/ledger/pnl" />}
            />
            <TablePagination testId="ledger-pnl-pagination" />
          </Panel>
        </TabsContent>
        <TabsContent value="digital" className="mt-4 space-y-4">
          <Panel title="数字资产分账 / Digital asset sub-ledger" testId="panel-ledger-digital">
            <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">USDT 按公链单独记账，兑换法币在充值时点入账；USDT 与法币不得直接相加。以下为 mock 预览数据。</p>
            <FilterBar
              testId="ledger-digital-filter"
              searchPlaceholder="科目 / Trace ID"
              filters={[{ id: "status", label: "状态 Status", options: STATUS_FILTER_OPTIONS }]}
              onRefresh={() => {}}
              extra={<ChainSelect includeAll testId="ledger-digital-filter-chain" />}
            />
            <MockTable
              testId="ledger-digital-table"
              minWidth={960}
              columns={["公链 Chain", "科目 Account", "可用 Available", "冻结 Frozen", "在途 In transit", "币种 Currency", "状态 Status"]}
              rows={MOCK_USDT_BALANCES}
              rowKey={(r) => r.chain}
              renderRow={(r) => [
                chainLabel(r.chain),
                "2101 · 客户数字资产负债 Customer USDT liability",
                <span className="num">{r.available}</span>,
                <span className="num">{r.frozen}</span>,
                <span className="num">{r.inTransit}</span>,
                "USDT",
                <StatusBadge label={r.status} tone={statusTone(r.status)} />,
              ]}
            />
            <TablePagination testId="ledger-digital-pagination" total={MOCK_USDT_BALANCES.length} />
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
