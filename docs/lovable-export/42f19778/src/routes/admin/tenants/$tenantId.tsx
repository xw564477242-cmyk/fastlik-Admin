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
import { TENANTS, useAdminSession } from "@/components/admin/admin-session";
import { PRODUCTS } from "@/lib/admin-products";
import { RateField, SwitchField, ChainToggles, FormSection } from "@/components/admin/digital-asset-fields";
import { FEE_CAPS, type ChainId } from "@/lib/admin-chains";
import { useState } from "react";

export const Route = createFileRoute("/admin/tenants/$tenantId")({
  component: TenantDetailPage,
});

function TenantDetailPage() {
  const { tenantId } = useParams({ from: "/admin/tenants/$tenantId" });
  const tenant = TENANTS.find((t) => t.id === tenantId);
  const { environment } = useAdminSession();
  const [usdtEnabled, setUsdtEnabled] = useState(true);
  const [chains, setChains] = useState<ChainId[]>(["trc20"]);

  if (!tenant) {
    return (
      <Panel title="租户 / Tenant" testId="panel-tenant-missing">
        <EmptyState title="未找到租户 · Tenant not found" description={`控制台范围内没有 ${tenantId}。`} />
      </Panel>
    );
  }

  return (
    <div key={tenantId} className="space-y-4">
      <PageHeader
        titleZh={tenant.name}
        titleEn="Tenant detail"
        description={`${tenant.code} · 当前为 SANDBOX 预览；配置保存将在 FastLink 后端 API 契约接入后启用，当前不执行写入。`}
        actions={
          <Button asChild size="sm" variant="ghost" data-testid="tenant-back">
            <Link to="/admin/tenants">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              返回列表 Back
            </Link>
          </Button>
        }
        meta={
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge label="SANDBOX MOCK PREVIEW" tone="info" />
            <StatusBadge label={environment} tone="warning" />
          </div>
        }
      />
      <PageMetaBar source={`GET /api/admin/tenants/${tenant.id}`} />

      <Tabs defaultValue="capabilities">
        <TabsList data-testid="tenant-tabs">
          <TabsTrigger value="basic" data-testid="tenant-tab-basic">基础信息 Basic</TabsTrigger>
          <TabsTrigger value="capabilities" data-testid="tenant-tab-capabilities">
            已开通能力 Capabilities
          </TabsTrigger>
          <TabsTrigger value="limits" data-testid="tenant-tab-limits">限额与费率 Limits</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tenant-tab-audit">审计 Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="mt-4">
          <Panel title="基础信息 / Basic" testId="panel-tenant-basic">
            <DefinitionList
              testId="tenant-definition"
              items={[
                { label: "租户名称 Tenant", value: tenant.name },
                { label: "租户编码 Code", value: tenant.code },
                { label: "接入模式 Model" },
                { label: "状态 Status", value: "SANDBOX MOCK PREVIEW" },
                { label: "联系人 Contact", masked: true },
                { label: "当前环境 Environment", value: environment },
              ]}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="capabilities" className="mt-4 space-y-4">
          <Panel
            title="租户发卡 & 数字资产权限 / Tenant issuing & digital asset permissions"
            subtitle="本租户所有虚拟卡 / 实体卡发卡能力总开关。租户层面的费率与分润边界会向下约束产品模板的配置，产品与单卡都不得超过此边界。mock 预览表单。"
            testId="panel-tenant-digital-asset"
            actions={
              <SideEffectAction
                testId="tenant-digital-asset-save"
                label="保存 Save"
                description="租户级开关与倍率变更需双人复核后由后端执行。"
              />
            }
          >
            <p className="mb-4 text-xs text-muted-foreground" data-testid="tenant-fee-limit-hint">
              租户级费率上限，会约束该租户下<strong>全部卡产品模板、所有下发的实体/虚拟卡</strong>，子配置不能突破该阈值。
            </p>
            <FormSection titleZh="USDT 充提" titleEn="USDT deposit & withdrawal" testId="section-tenant-usdt">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SwitchField
                  testId="tenant-allow-usdt"
                  labelZh="允许该租户 USDT 充提"
                  labelEn="Allow USDT deposit / withdrawal"
                  description="关闭后该租户下所有卡片仅支持法币入金。"
                  checked={usdtEnabled}
                  onCheckedChange={setUsdtEnabled}
                />
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">开放公链 Enabled chains</p>
                  <ChainToggles value={chains} onChange={setChains} disabled={!usdtEnabled} testId="tenant-chains" />
                  <p className="text-[11px] text-muted-foreground">仅平台已启用的公链可开放给租户。</p>
                </div>
              </div>
            </FormSection>
            <FormSection titleZh="费率倍率与分润" titleEn="Fee multiplier & referral" testId="section-tenant-fees">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <RateField
                  capKey="tenantMultiplier"
                  testId="tenant-fee-multiplier"
                  labelZh="租户独立手续费倍率上限"
                  defaultValue="1.2"
                />
                <RateField
                  capKey="referralRate"
                  testId="tenant-referral-max"
                  labelZh="租户分润费率上限"
                  defaultValue="25"
                />
                <SwitchField
                  testId="tenant-allow-referral"
                  labelZh="开启上下级推荐分润"
                  labelEn="Enable referral commission"
                  description={`系统全局上限 ${FEE_CAPS.referralRate.max}%，租户不可超过。`}
                  defaultChecked
                />
              </div>
            </FormSection>
          </Panel>

          <Panel
            title="已开通能力 / Enabled capabilities"
            subtitle="当前为 SANDBOX 预览；配置保存将在 FastLink 后端 API 契约接入后启用，当前不执行写入。"
            testId="panel-tenant-capabilities"
            actions={
              <SideEffectAction
                testId="tenant-capability-change"
                label="修改能力 Modify"
                description="当前为 SANDBOX 预览；配置保存将在 FastLink 后端 API 契约接入后启用，当前不执行写入。"
              />
            }
          >
            <DefinitionList
              testId="tenant-capability-summary"
              items={[
                { label: "支持币种 Currencies" },
                { label: "钱包类型 Wallet types" },
                { label: "卡片类型 Card types" },
                { label: "支付能力 Payment capabilities" },
                { label: "换汇能力 FX capabilities" },
                { label: "KYC 提供商 KYC provider" },
                { label: "发卡提供商 Issuing provider" },
                { label: "银行 / 清算提供商 Bank & settlement" },
                { label: "API 权限 API scopes" },
                { label: "交易与金额限额 Limits" },
                { label: "费率方案 Fee schedule" },
                { label: "生效时间 Effective from" },
                { label: "当前环境 Environment", value: environment },
              ]}
            />
          </Panel>

          <Panel title="产品开通状态 / Product enablement" testId="panel-tenant-products">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm" data-testid="tenant-products-table">
                <thead>
                  <tr className="border-b border-border bg-surface/60">
                    {["产品 Product", "开通状态 Status", "提供商 Provider", "生效时间 Effective", "环境 Env"].map((c) => (
                      <th
                        key={c}
                        scope="col"
                        className="whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PRODUCTS.map((p) => (
                    <tr key={p.id} className="border-b border-border/60 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Link
                          to="/admin/products/$productId"
                          params={{ productId: p.id }}
                          className="underline-offset-4 hover:underline"
                        >
                          {p.nameZh} / {p.nameEn}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge label="SANDBOX MOCK PREVIEW" tone="info" />
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">—</td>
                      <td className="px-4 py-2.5 text-muted-foreground">—</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge label={environment} tone="warning" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="limits" className="mt-4">
          <Panel title="限额与费率 / Limits & pricing" testId="panel-tenant-limits">
            <DataTableShell
              testId="tenant-limits-table"
              columns={["限额类型 Type", "币种 Currency", "数值 Value", "版本 Version", "生效时间 Effective", "审批状态 Approval"]}
              state={<PendingBackendState endpoint={`GET /api/admin/limits?tenant=${tenant.id}`} />}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Panel title="审计记录 / Audit trail" testId="panel-tenant-audit">
            <DataTableShell
              testId="tenant-audit-table"
              columns={["时间 Time", "操作人 Actor", "动作 Action", "变更前 Before", "变更后 After", "Trace ID"]}
              state={<PendingBackendState endpoint={`GET /api/admin/audit?tenant=${tenant.id}`} />}
            />
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
