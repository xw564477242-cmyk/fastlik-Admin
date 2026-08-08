import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DataTableShell,
  DefinitionList,
  PageHeader,
  Panel,
  StatusBadge,
} from "@/components/admin/primitives";
import { PageMetaBar } from "@/components/admin/page-meta";
import { EmptyState, PendingBackendState } from "@/components/admin/states";
import { SideEffectAction } from "@/components/admin/side-effect-action";
import { findProduct, familyLabel } from "@/lib/admin-products";
import { useAdminSession } from "@/components/admin/admin-session";
import {
  ChainToggles,
  FieldRow,
  FormSection,
  RateField,
  SwitchField,
} from "@/components/admin/digital-asset-fields";
import { Input } from "@/components/ui/input";
import { ISSUING_BANKS, TENANT_FEE_MULTIPLIER_CAP, TENANT_REFERRAL_CAP } from "@/lib/admin-chains";
import type { ChainId } from "@/lib/admin-chains";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/products/$productId")({
  component: ProductDetailPage,
});

/** Template default fee values (mock) used for the before/after diff. */
const FEE_DEFAULTS = {
  usdtDepositRate: "1.0",
  cardSpendRate: "1.5",
  assetWithdrawRate: "1.0",
  cashWithdrawRate: "2.0",
  thirdPartyPayRate: "2.0",
  referralRate: "20",
};

type FeeKey = keyof typeof FEE_DEFAULTS;

const FEE_FIELDS: { key: FeeKey; label: string; unit: string }[] = [
  { key: "usdtDepositRate", label: "USDT 充值手续费", unit: "%" },
  { key: "cardSpendRate", label: "卡片消费手续费", unit: "%" },
  { key: "assetWithdrawRate", label: "数字资产提现手续费", unit: "%" },
  { key: "cashWithdrawRate", label: "银行卡取现手续费", unit: "%" },
  { key: "thirdPartyPayRate", label: "第三方应用支付手续费", unit: "%" },
  { key: "referralRate", label: "推荐分润费率上限", unit: "%" },
];

function ProductDetailPage() {
  const { productId } = useParams({ from: "/admin/products/$productId" });
  const product = findProduct(productId);
  const { environment, scopeKey } = useAdminSession();
  const [usdtDeposit, setUsdtDeposit] = useState(true);
  const [chains, setChains] = useState<ChainId[]>(["trc20", "erc20"]);
  const [referral, setReferral] = useState(true);
  const [fees, setFees] = useState<Record<FeeKey, string>>(FEE_DEFAULTS);
  const feeChange = (key: FeeKey) => ({
    value: fees[key],
    onChange: (next: string) => setFees((prev) => ({ ...prev, [key]: next })),
  });
  const changes = FEE_FIELDS.filter((f) => fees[f.key] !== FEE_DEFAULTS[f.key]).map((f) => ({
    label: f.label,
    before: `${FEE_DEFAULTS[f.key]} ${f.unit}`,
    after: `${fees[f.key] || "—"} ${f.unit}`,
  }));

  if (!product) {
    return (
      <Panel title="产品 / Product" testId="panel-product-missing">
        <EmptyState title="未找到产品 · Product not found" description={`产品目录中没有 ${productId}。`} />
      </Panel>
    );
  }

  return (
    <div key={`${scopeKey}:${productId}`} className="space-y-4">
      <PageHeader
        titleZh={product.nameZh}
        titleEn={product.nameEn}
        description={`${product.code} · ${familyLabel(product.family)}`}
        actions={
          <>
            <Button asChild size="sm" variant="ghost" data-testid="product-back">
              <Link to="/admin/products">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                返回目录 Back
              </Link>
            </Button>
            <SideEffectAction
              testId="product-enable"
              label="开通到 Tenant Enable"
              description="当前为 SANDBOX 预览；配置保存将在 FastLink 后端 API 契约接入后启用，当前不执行写入。"
            />
          </>
        }
        meta={
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge label="SANDBOX MOCK PREVIEW" tone="info" />
            <StatusBadge label={environment} tone="warning" />
            <StatusBadge label="UNDER DEVELOPMENT" tone="info" />
          </div>
        }
      />
      <PageMetaBar source={`GET /api/admin/products/${product.id}`} />

      <Tabs defaultValue="issuing">
        <TabsList data-testid="product-tabs">
          <TabsTrigger value="issuing" data-testid="product-tab-issuing">发卡与费率配置 Issuing & Fees</TabsTrigger>
          <TabsTrigger value="basic" data-testid="product-tab-basic">基础信息 Basic</TabsTrigger>
          <TabsTrigger value="providers" data-testid="product-tab-providers">提供商 Providers</TabsTrigger>
          <TabsTrigger value="tenants" data-testid="product-tab-tenants">适用 Tenant</TabsTrigger>
          <TabsTrigger value="pricing" data-testid="product-tab-pricing">收费模式 Pricing</TabsTrigger>
          <TabsTrigger value="risk" data-testid="product-tab-risk">风险与限额 Risk</TabsTrigger>
        </TabsList>

        <TabsContent value="issuing" className="mt-4 space-y-4">
          <Panel
            title="发卡产品配置 / Card product configuration"
            subtitle="U 卡发卡为系统核心；数字资产充提为配套资金链路。以下为 mock 预览表单，不会提交后端。"
            testId="panel-product-issuing"
            actions={
              <SideEffectAction
                testId="product-config-save"
                label="保存配置 Save"
                description="当前为 SANDBOX 预览；配置保存将在 FastLink 后端 API 契约接入后启用，当前不执行写入。以下为本次修改前 / 修改后数值对比。"
                changes={
                  changes.length > 0
                    ? changes
                    : [{ label: "费率与分润 Fees", before: "无变更", after: "无变更" }]
                }
              />
            }
          >
            <FormSection titleZh="1 · 卡片类型" titleEn="Card types" testId="section-card-types">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SwitchField
                  testId="config-virtual-card"
                  labelZh="虚拟 U 卡"
                  labelEn="Virtual USDT card"
                  description="核心业务：即时发卡，支持 USDT 充值兑换法币余额。"
                  defaultChecked
                />
                <SwitchField
                  testId="config-physical-card"
                  labelZh="实体卡"
                  labelEn="Physical card"
                  description="需邮寄与激活流程，按发卡行结算币种开卡。"
                  defaultChecked
                />
              </div>
            </FormSection>

            <FormSection titleZh="2 · 开卡费与月费" titleEn="Issuing fee & monthly fee" testId="section-card-fees">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <RateField capKey="cardIssueFee" testId="config-issue-fee-virtual" labelZh="虚拟卡开卡费" defaultValue="6" />
                <RateField capKey="cardIssueFee" testId="config-issue-fee-physical" labelZh="实体卡开卡费" defaultValue="18" />
                <RateField capKey="cardMonthlyFee" testId="config-monthly-fee" defaultValue="1.5" />
                <FieldRow label="发卡行 Issuing bank" hint="不同发卡行对应不同法币结算币种">
                  <Select defaultValue={ISSUING_BANKS[0]!.id}>
                    <SelectTrigger data-testid="config-issuing-bank" className="h-9 text-sm">
                      <SelectValue placeholder="选择发卡行" />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUING_BANKS.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} · {b.currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
              </div>
            </FormSection>

            <FormSection titleZh="3 · 充值来源与发卡行结算" titleEn="Funding source & settlement" testId="section-funding">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SwitchField
                  testId="config-usdt-deposit"
                  labelZh="开启 USDT 链上充值"
                  labelEn="Enable on-chain USDT deposit"
                  description="关闭后该产品仅支持法币入金渠道。"
                  checked={usdtDeposit}
                  onCheckedChange={setUsdtDeposit}
                />
                <FieldRow
                  label="可用公链 Available chains"
                  hint={usdtDeposit ? "全局公链下拉/多选组件，表单多处复用。" : "USDT 充值已关闭，公链选择不可用。"}
                >
                  <ChainToggles value={chains} onChange={setChains} disabled={!usdtDeposit} testId="config-chains" />
                </FieldRow>
                <FieldRow label="绑定发卡行与结算币种 Bank & settlement currency" hint="USDT 充值按该发卡行的法币结算币种兑换入账">
                  <Select defaultValue={ISSUING_BANKS[0]!.id} disabled={!usdtDeposit}>
                    <SelectTrigger data-testid="config-funding-bank" className="h-9 text-sm">
                      <SelectValue placeholder="发卡行 / 结算币种" />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUING_BANKS.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} · 结算 {b.currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldRow>
              </div>
            </FormSection>

            <FormSection
              titleZh="4 · 全链路手续费"
              titleEn="End-to-end fees"
              testId="section-fees"
              badge={
                <span className="text-[11px] text-muted-foreground">
                  租户侧倍率上限 {TENANT_FEE_MULTIPLIER_CAP}x — 实际生效边界取平台上限与租户上限的较小值
                </span>
              }
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <RateField capKey="usdtDepositRate" testId="config-usdt-deposit-rate" disabled={!usdtDeposit} {...feeChange("usdtDepositRate")} />
                <RateField capKey="cardSpendRate" testId="config-card-spend-rate" {...feeChange("cardSpendRate")} />
                <RateField capKey="assetWithdrawRate" testId="config-asset-withdraw-rate" disabled={!usdtDeposit} {...feeChange("assetWithdrawRate")} />
                <RateField capKey="cashWithdrawRate" testId="config-cash-withdraw-rate" {...feeChange("cashWithdrawRate")} />
                <RateField capKey="thirdPartyPayRate" testId="config-third-party-rate" {...feeChange("thirdPartyPayRate")} />
                <FieldRow label="最低手续费 Minimum fee" hint="每笔手续费下限，按结算币种计">
                  <Input data-testid="config-min-fee" className="h-9 text-sm" placeholder="0.50" />
                </FieldRow>
              </div>
            </FormSection>

            <FormSection titleZh="5 · 推荐分润" titleEn="Referral commission" testId="section-referral">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SwitchField
                  testId="config-referral"
                  labelZh="开启上下级分润"
                  labelEn="Enable upline / downline commission"
                  description="上级可为下级配置分润比例，超过上限的配置将被拒绝。"
                  checked={referral}
                  onCheckedChange={setReferral}
                />
                <RateField
                  capKey="referralRate"
                  testId="config-referral-max"
                  labelZh="本产品模板分润费率上限"
                  disabled={!referral}
                  parentCap={TENANT_REFERRAL_CAP}
                  parentLabel="租户级分润上限"
                  {...feeChange("referralRate")}
                />
                <FieldRow label="允许层级 Levels" hint="上下级分润的最大层级数">
                  <Select defaultValue="2" disabled={!referral}>
                    <SelectTrigger data-testid="config-referral-levels" className="h-9 text-sm">
                      <SelectValue placeholder="层级" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 级 One level</SelectItem>
                      <SelectItem value="2">2 级 Two levels</SelectItem>
                      <SelectItem value="3">3 级 Three levels</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
              </div>
            </FormSection>
          </Panel>
        </TabsContent>

        <TabsContent value="basic" className="mt-4">
          <Panel title="产品定义 / Product definition" testId="panel-product-basic">
            <DefinitionList
              testId="product-definition"
              items={[
                { label: "产品名称 Name", value: `${product.nameZh} / ${product.nameEn}` },
                { label: "产品代码 Code", value: product.code },
                { label: "产品族 Family", value: familyLabel(product.family) },
                { label: "产品状态 Status", value: "SANDBOX MOCK PREVIEW" },
                { label: "支持国家 Countries" },
                { label: "支持币种 Currencies" },
                { label: "收费模式 Pricing model" },
                { label: "风险等级 Risk level" },
                { label: "当前环境 Environment", value: environment },
                { label: "是否正式接入 Live", value: "否 No · UNDER DEVELOPMENT" },
              ]}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="providers" className="mt-4">
          <Panel title="使用的第三方提供商 / Providers" testId="panel-product-providers">
            {product.providerIds.length === 0 ? (
              <EmptyState description="该产品尚未绑定第三方提供商。" />
            ) : (
              <ul className="divide-y divide-border">
                {product.providerIds.map((id) => (
                  <li key={id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <Link
                      to="/admin/providers/$providerId"
                      params={{ providerId: id }}
                      className="font-medium underline-offset-4 hover:underline"
                      data-testid={`product-provider-${id}`}
                    >
                      {id}
                    </Link>
                    <StatusBadge label="SANDBOX MOCK PREVIEW" tone="info" />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="tenants" className="mt-4">
          <Panel title="适用 Tenant / Enabled tenants" testId="panel-product-tenants">
            <DataTableShell
              testId="product-tenants-table"
              columns={["Tenant", "开通状态 Status", "生效时间 Effective", "限额 Limits", "费率方案 Pricing", "环境 Env"]}
              state={<PendingBackendState endpoint={`GET /api/admin/products/${product.id}/tenants`} />}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="pricing" className="mt-4">
          <Panel title="收费模式 / Pricing" testId="panel-product-pricing">
            <PendingBackendState endpoint={`GET /api/admin/pricing/products/${product.id}`} />
          </Panel>
        </TabsContent>

        <TabsContent value="risk" className="mt-4">
          <Panel title="风险与限额 / Risk & limits" testId="panel-product-risk">
            <PendingBackendState endpoint={`GET /api/admin/limits?product=${product.id}`} />
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
