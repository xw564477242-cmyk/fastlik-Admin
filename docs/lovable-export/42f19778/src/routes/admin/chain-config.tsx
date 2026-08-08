import { createFileRoute } from "@tanstack/react-router";
import { FilterBar, PageHeader, Panel, StatusBadge, TablePagination } from "@/components/admin/primitives";
import { PageMetaBar } from "@/components/admin/page-meta";
import { MockTable } from "@/components/admin/mock-table";
import { CopyableText, FieldRow, ChainSelect } from "@/components/admin/digital-asset-fields";
import { SideEffectAction } from "@/components/admin/side-effect-action";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CHAINS, statusTone } from "@/lib/admin-chains";
import { useAdminSession } from "@/components/admin/admin-session";

export const Route = createFileRoute("/admin/chain-config")({
  head: () => ({
    meta: [
      { title: "链参数配置 · FastLink Admin" },
      { name: "description", content: "USDT 公链参数：链 ID、合约地址、确认数与 Gas 配置。" },
    ],
  }),
  component: ChainConfigPage,
});

function ChainConfigPage() {
  const { scopeKey } = useAdminSession();
  return (
    <div key={scopeKey} className="space-y-4">
      <PageHeader
        titleZh="链参数配置"
        titleEn="Chain Parameters"
        description="USDT 充提所依赖的公链参数（TRC20 / ERC20 / BEP20）：链 ID、合约地址、确认数、Gas 与启用开关。资金管理模块内的配套配置页。"
        actions={
          <SideEffectAction
            testId="chain-config-save"
            label="保存参数 Save"
            description="链参数变更影响所有租户的充提链路。当前为 SANDBOX 预览；配置保存将在 FastLink 后端 API 契约接入后启用，当前不执行写入。"
          />
        }
      />
      <PageMetaBar source="GET /api/admin/chains (mock)" />

      <Panel title="公链清单 / Chain list" subtitle="以下为 mock 预览数据" testId="panel-chain-list">
        <FilterBar
          testId="chain-filter"
          searchPlaceholder="链名称 / 合约地址"
          onRefresh={() => {}}
          extra={<ChainSelect includeAll testId="chain-filter-chain" />}
        />
        <MockTable
          testId="chain-table"
          minWidth={1080}
          columns={["公链 Chain", "网络 Network", "链 ID Chain ID", "合约地址 Contract", "确认数 Confirmations", "Gas 配置 Gas", "启用 Enabled", "状态 Status"]}
          rows={CHAINS}
          rowKey={(c) => c.id}
          renderRow={(c) => [
            c.label,
            c.network,
            <span className="num text-xs">{c.chainId}</span>,
            <CopyableText value={c.contract} testId={`chain-contract-${c.id}`} label="合约地址" />,
            <span className="num">{c.confirmations}</span>,
            <span className="num text-xs">{c.gasToken} · {c.gasPrice}</span>,
            <Switch defaultChecked={c.enabled} data-testid={`chain-enabled-${c.id}`} />,
            <StatusBadge label={c.enabled ? "ACTIVE" : "PAUSED"} tone={statusTone(c.enabled ? "ACTIVE" : "PAUSED")} />,
          ]}
        />
        <TablePagination testId="chain-pagination" total={CHAINS.length} />
      </Panel>

      <Panel title="Gas 与阈值 / Gas & thresholds" testId="panel-chain-gas">
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
          <FieldRow label="目标公链 Target chain" hint="全局复用的公链选择组件">
            <ChainSelect testId="chain-gas-chain" className="w-full" />
          </FieldRow>
          <FieldRow label="Gas 上限 Gas limit" hint="mock 预览，不会提交后端">
            <Input data-testid="chain-gas-limit" className="h-9 text-sm" placeholder="120000" />
          </FieldRow>
          <FieldRow label="最小充值金额 Min deposit (USDT)" hint="低于该金额的链上转入进入人工处理">
            <Input data-testid="chain-min-deposit" className="h-9 text-sm" placeholder="10.000000" />
          </FieldRow>
          <FieldRow label="归集阈值 Sweep threshold (USDT)">
            <Input data-testid="chain-sweep-threshold" className="h-9 text-sm" placeholder="5000.000000" />
          </FieldRow>
          <FieldRow label="确认数 Confirmations">
            <Input data-testid="chain-confirmations" className="h-9 text-sm" placeholder="19" />
          </FieldRow>
          <FieldRow label="Gas 告警余额 Gas alert">
            <Input data-testid="chain-gas-alert" className="h-9 text-sm" placeholder="500" />
          </FieldRow>
        </div>
      </Panel>
    </div>
  );
}
