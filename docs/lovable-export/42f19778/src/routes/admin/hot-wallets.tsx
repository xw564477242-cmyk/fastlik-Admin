import { createFileRoute } from "@tanstack/react-router";
import { FilterBar, PageHeader, Panel, StatusBadge, TablePagination } from "@/components/admin/primitives";
import { PageMetaBar } from "@/components/admin/page-meta";
import { MockMetric, MockTable } from "@/components/admin/mock-table";
import { ChainSelect, CopyableText } from "@/components/admin/digital-asset-fields";
import { SideEffectAction } from "@/components/admin/side-effect-action";
import { Switch } from "@/components/ui/switch";
import { MOCK_HOT_WALLETS, chainLabel, statusTone } from "@/lib/admin-chains";
import { STATUS_FILTER_OPTIONS } from "@/lib/admin-status";
import { useAdminSession } from "@/components/admin/admin-session";

export const Route = createFileRoute("/admin/hot-wallets")({
  head: () => ({
    meta: [
      { title: "热钱包管理 · FastLink Admin" },
      { name: "description", content: "多链热钱包地址、余额与状态开关。" },
    ],
  }),
  component: HotWalletsPage,
});

function HotWalletsPage() {
  const { scopeKey } = useAdminSession();
  return (
    <div key={scopeKey} className="space-y-4">
      <PageHeader
        titleZh="热钱包管理"
        titleEn="Hot Wallet Management"
        description="多链热钱包地址、USDT 余额、Gas 余额与状态开关。地址与交易 Hash 均支持一键复制。"
        actions={
          <SideEffectAction
            testId="hot-wallet-sweep"
            label="归集到冷钱包 Sweep"
            destructive
            description="资金归集为不可逆链上操作，需双人复核后由后端执行。"
          />
        }
      />
      <PageMetaBar source="GET /api/admin/wallets/hot (mock)" />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MockMetric testId="metric-hot-total" labelZh="热钱包 USDT 合计" labelEn="Hot wallet USDT" value="647,522.98" hint="按公链拆分见下表" />
        <MockMetric testId="metric-hot-frozen" labelZh="冻结 USDT" labelEn="Frozen USDT" value="17,400.00" hint="风控冻结与待清算" />
        <MockMetric testId="metric-hot-wallets" labelZh="热钱包数量" labelEn="Wallets" value="3" hint="TRC20 / ERC20 / BEP20" />
      </section>

      <Panel title="热钱包地址 / Hot wallets" subtitle="以下为 mock 预览数据" testId="panel-hot-wallets">
        <FilterBar
          testId="hot-wallet-filter"
          searchPlaceholder="钱包 ID / 地址 Address"
          filters={[{ id: "status", label: "状态 Status", options: STATUS_FILTER_OPTIONS }]}
          onRefresh={() => {}}
          extra={<ChainSelect includeAll testId="hot-wallet-filter-chain" />}
        />
        <MockTable
          testId="hot-wallets-table"
          minWidth={1080}
          columns={["钱包 Wallet", "公链 Chain", "地址 Address", "可用 USDT Available", "冻结 Frozen", "Gas 余额", "启用 Enabled", "状态 Status", "更新 Updated"]}
          rows={MOCK_HOT_WALLETS}
          rowKey={(w) => w.id}
          renderRow={(w) => [
            w.id,
            chainLabel(w.chain),
            <CopyableText value={w.address} testId={`hot-wallet-address-${w.id}`} label="钱包地址" />,
            <span className="num">{w.usdt}</span>,
            <span className="num">{w.frozen}</span>,
            <span className="num text-xs">{w.gas}</span>,
            <Switch defaultChecked={w.status === "ACTIVE"} data-testid={`hot-wallet-toggle-${w.id}`} />,
            <StatusBadge label={w.status} tone={statusTone(w.status)} />,
            <span className="num text-xs text-muted-foreground">{w.updated}</span>,
          ]}
        />
        <TablePagination testId="hot-wallets-pagination" total={MOCK_HOT_WALLETS.length} />
      </Panel>
    </div>
  );
}
