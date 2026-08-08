import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import {
  DataTableShell,
  FilterBar,
  MetricCard,
  PageHeader,
  Panel,
  TablePagination,
} from "@/components/admin/primitives";
import { SideEffectAction } from "@/components/admin/side-effect-action";
import { EmptyState } from "@/components/admin/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChainSelect } from "@/components/admin/digital-asset-fields";
import { RANGE_OPTIONS, TENANT_FILTER_OPTIONS, TX_TYPE_OPTIONS } from "@/lib/admin-chains";

export const Route = createFileRoute("/admin/treasury")({
  component: TreasuryPage,
});

function TreasuryPage() {
  return (
    <>
      <PageHeader
        titleZh="资金池与清算"
        titleEn="Treasury & Settlement"
        description="资金池余额、备付金、清算批次与试算平衡。所有金额在账务接口接入前保持空值。"
        actions={
          <SideEffectAction
            testId="treasury-close-day"
            label="日终关账 Close day"
            destructive
            icon={<Lock className="mr-1.5 h-3.5 w-3.5" />}
            description="日终关账会锁定当日账务，属不可逆操作，需双人复核。"
          />
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          testId="metric-float-balance"
          labelZh="资金池余额"
          labelEn="Float balance"
          source="GET /api/admin/treasury/float"
        />
        <MetricCard
          testId="metric-reserve"
          labelZh="备付金"
          labelEn="Reserve"
          source="GET /api/admin/treasury/reserve"
        />
        <MetricCard
          testId="metric-settlement-pending"
          labelZh="待清算金额"
          labelEn="Pending settlement"
          source="GET /api/admin/settlement/pending"
        />
        <MetricCard
          testId="metric-trial-balance"
          labelZh="试算差额"
          labelEn="Trial balance diff"
          source="GET /api/admin/ledger/trial-balance"
        />
      </section>

      <Tabs defaultValue="batches" className="w-full">
        <TabsList data-testid="treasury-tabs">
          <TabsTrigger value="batches" data-testid="treasury-tab-batches">
            清算批次 Batches
          </TabsTrigger>
          <TabsTrigger value="reconciliation" data-testid="treasury-tab-reconciliation">
            对账 Reconciliation
          </TabsTrigger>
          <TabsTrigger value="trial-balance" data-testid="treasury-tab-trial-balance">
            试算平衡 Trial balance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="batches" className="mt-4">
          <Panel title="清算批次 / Settlement batches" testId="panel-settlement-batches">
            <FilterBar
              testId="settlement-filter"
              searchPlaceholder="批次号 Batch ID"
              filters={[
                {
                  id: "status",
                  label: "状态 Status",
                  options: [
                    { value: "pending", label: "Pending" },
                    { value: "processing", label: "Processing" },
                    { value: "settled", label: "Settled" },
                    { value: "failed", label: "Failed" },
                  ],
                },
              ]}
              onRefresh={() => {}}
            />
            <DataTableShell
              testId="settlement-table"
              columns={[
                "批次号 Batch",
                "业务日期 Business date",
                "笔数 Count",
                "金额 Amount",
                "状态 Status",
                "操作 Actions",
              ]}
              state={<EmptyState description="清算接口尚未接入，无批次可展示。" />}
            />
            <TablePagination testId="settlement-pagination" />
          </Panel>
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-4">
          <Panel title="对账差异 / Reconciliation breaks" testId="panel-reconciliation">
            <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">对账维度已包含数字资产：公链、交易类型（充值 / 提现 / 消费 / 分润）、时间范围、租户与卡片。</p>
            <FilterBar
              testId="reconciliation-filter"
              searchPlaceholder="Hash / 卡 ID / 差异编号"
              filters={[
                { id: "type", label: "交易类型 Type", options: TX_TYPE_OPTIONS },
                { id: "tenant", label: "租户 Tenant", options: TENANT_FILTER_OPTIONS },
                { id: "range", label: "时间范围 Range", options: RANGE_OPTIONS },
              ]}
              onRefresh={() => {}}
              extra={<ChainSelect includeAll testId="reconciliation-filter-chain" />}
            />
            <DataTableShell
              testId="reconciliation-table"
              columns={["业务日期 Date", "来源 Source", "公链 Chain", "交易类型 Type", "差异金额 Diff", "手续费 Fee", "状态 Status"]}
              state={<EmptyState description="对账文件与账务接口尚未接入。" />}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="trial-balance" className="mt-4">
          <Panel title="试算平衡 / Trial balance" testId="panel-trial-balance">
            <DataTableShell
              testId="trial-balance-table"
              columns={["科目 Account", "借方 Debit", "贷方 Credit", "净额 Net", "币种 Currency"]}
              state={<EmptyState description="总账接口尚未接入，不展示试算数据。" />}
            />
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}
