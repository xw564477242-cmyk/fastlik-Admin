import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { Snowflake, Ban, CreditCard } from "lucide-react";
import {
  DefinitionList,
  FilterBar,
  PageHeader,
  Panel,
  StatusBadge,
  TablePagination,
} from "@/components/admin/primitives";
import { PageMetaBar } from "@/components/admin/page-meta";
import { SideEffectAction } from "@/components/admin/side-effect-action";
import { MockTable } from "@/components/admin/mock-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChainSelect,
  CopyableText,
  FieldRow,
  FormSection,
  RateField,
  SwitchField,
} from "@/components/admin/digital-asset-fields";
import {
  CARD_PRODUCT_TEMPLATES,
  ISSUING_BANKS,
  MOCK_CARDS,
  MOCK_DEPOSITS,
  MOCK_REFERRALS,
  MOCK_SPEND,
  MOCK_WITHDRAWALS,
  TENANT_FILTER_OPTIONS,
  chainLabel,
  statusTone,
  templateForCard,
} from "@/lib/admin-chains";

export const Route = createFileRoute("/admin/card-center")({
  validateSearch: (search: Record<string, unknown>) => ({
    /** Optional holder filter — used by 终端用户 → 查看该用户全部卡片. */
    user: typeof search.user === "string" ? search.user : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Card Center · FastLink Admin" },
      { name: "description", content: "开卡申请、卡片检索与卡片详情（含 USDT 充值与分润记录）。" },
    ],
  }),
  component: CardCenterPage,
});

function CardCenterPage() {
  const { user } = useSearch({ from: "/admin/card-center" });
  const cards = user
    ? MOCK_CARDS.filter((c) => c.holder.toLowerCase().includes(user.toLowerCase()))
    : MOCK_CARDS;
  const [selected, setSelected] = useState(MOCK_CARDS[0]!);
  const [usdtFunding, setUsdtFunding] = useState(true);
  const [overrideFees, setOverrideFees] = useState(false);
  const template = templateForCard(selected.id);
  const deposits = MOCK_DEPOSITS.filter((d) => d.card === selected.id);
  const withdrawals = MOCK_WITHDRAWALS.filter((w) => w.card === selected.id);
  const spend = MOCK_SPEND.filter((s) => s.card === selected.id && s.channel === "卡消费 Card");
  const thirdParty = MOCK_SPEND.filter((s) => s.card === selected.id && s.channel === "第三方支付 Third-party");
  const cashOut = withdrawals.filter((w) => w.kind === "银行卡取现 Cash-out");
  const referrals = MOCK_REFERRALS.filter((r) => r.card === selected.id);

  return (
    <div className="space-y-4">
      <PageHeader
        titleZh="Card Center"
        titleEn="Card Center"
        description="开卡申请、卡片检索与单卡详情。虚拟 U 卡与实体卡为核心业务，USDT 链上充值作为配套资金链路。敏感信息默认脱敏。"
      />
      <PageMetaBar source="GET /api/admin/cards (mock)" />

      <Panel
        title="开卡申请 / Card application"
        subtitle="mock 预览表单，不会提交后端"
        testId="panel-card-application"
        actions={
          <SideEffectAction
            testId="card-apply-submit"
            label="提交开卡 Submit"
            icon={<CreditCard className="mr-1.5 h-3.5 w-3.5" />}
            description="开卡将向发卡行发起请求并收取开卡费，需后端接入后执行。"
          />
        }
      >
        <FormSection titleZh="1 · 卡片与发卡行" titleEn="Card & issuing bank" testId="section-apply-card">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FieldRow label="卡片类型 Card form" hint="核心业务优先：虚拟 U 卡">
              <Select defaultValue="virtual">
                <SelectTrigger data-testid="apply-card-form" className="h-9 text-sm">
                  <SelectValue placeholder="卡片类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="virtual">虚拟 U 卡 Virtual</SelectItem>
                  <SelectItem value="physical">实体卡 Physical</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="发卡行 Issuing bank" hint="发卡行决定法币结算币种">
              <Select defaultValue={ISSUING_BANKS[0]!.id}>
                <SelectTrigger data-testid="apply-issuing-bank" className="h-9 text-sm">
                  <SelectValue placeholder="发卡行" />
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
            <FieldRow label="所属租户 Tenant">
              <Select defaultValue={TENANT_FILTER_OPTIONS[0]!.value}>
                <SelectTrigger data-testid="apply-tenant" className="h-9 text-sm">
                  <SelectValue placeholder="租户" />
                </SelectTrigger>
                <SelectContent>
                  {TENANT_FILTER_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="申请用户 User" hint="用户 ID 或手机号">
              <Input data-testid="apply-user" className="h-9 text-sm" placeholder="U-88420" />
            </FieldRow>
            <FieldRow
              label="产品模板 Product template"
              hint="必选：只能选择已在产品详情完成费率与分润配置的模板"
            >
              <Select defaultValue={CARD_PRODUCT_TEMPLATES[0]!.id}>
                <SelectTrigger data-testid="apply-product-template" className="h-9 text-sm">
                  <SelectValue placeholder="选择产品模板" />
                </SelectTrigger>
                <SelectContent>
                  {CARD_PRODUCT_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · 结算 {t.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
        </FormSection>
        <FormSection titleZh="2 · 充值来源" titleEn="Funding source" testId="section-apply-funding">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SwitchField
              testId="apply-usdt-funding"
              labelZh="USDT 链上充值"
              labelEn="On-chain USDT deposit"
              description="开启后需选择充值公链，充值将兑换为平台内法币余额。"
              checked={usdtFunding}
              onCheckedChange={setUsdtFunding}
            />
            <FieldRow label="充值公链 Deposit chain" hint="全局复用的公链下拉组件">
              <ChainSelect testId="apply-chain" className="w-full" disabled={!usdtFunding} />
            </FieldRow>
            <FieldRow label="开卡费 Issuing fee" hint="按产品配置自动计算，可人工减免（待开发）">
              <Input data-testid="apply-issue-fee" className="h-9 text-sm" placeholder="6.00 USD" disabled />
            </FieldRow>
          </div>
        </FormSection>
      </Panel>

      <Panel title="卡片检索 / Card search" testId="panel-card-search">
        {user ? (
          <p
            data-testid="card-user-filter-notice"
            className="border-b border-border px-4 py-2.5 text-xs text-info"
          >
            已按终端用户 <span className="num">{user}</span> 过滤该用户名下全部卡片（mock 预览）。
          </p>
        ) : null}
        <FilterBar
          testId="card-filter"
          searchPlaceholder="卡 ID / 后四位 / 持卡人"
          filters={[
            {
              id: "status",
              label: "卡状态 Status",
              options: [
                { value: "active", label: "Active" },
                { value: "frozen", label: "Frozen" },
                { value: "closed", label: "Closed" },
                { value: "pending", label: "Pending activation" },
              ],
            },
            {
              id: "type",
              label: "卡形态 Form",
              options: [
                { value: "virtual", label: "Virtual" },
                { value: "physical", label: "Physical" },
              ],
            },
            { id: "tenant", label: "租户 Tenant", options: TENANT_FILTER_OPTIONS },
          ]}
          onRefresh={() => {}}
          extra={<ChainSelect includeAll testId="card-filter-chain" />}
        />
        <MockTable
          testId="card-table"
          minWidth={1180}
          columns={[
            "卡 ID Card ID",
            "卡号 Masked PAN",
            "卡形态 Form",
            "持卡人 Holder",
            "租户 Tenant",
            "发卡行 / 币种 Bank",
            "余额 Balance",
            "充值公链 Chains",
            "状态 Status",
            "更新时间 Updated",
          ]}
          rows={cards}
          rowKey={(c) => c.id}
          emptyDescription="当前筛选条件下暂无卡片数据。"
          renderRow={(c) => [
            <button
              type="button"
              onClick={() => setSelected(c)}
              data-testid={`card-select-${c.id}`}
              className="underline-offset-4 hover:underline"
            >
              {c.id}
            </button>,
            <span className="num text-xs">{c.pan}</span>,
            c.form,
            c.holder,
            c.tenant,
            <span className="text-xs">{c.bank} · {c.currency}</span>,
            <span className="num">{c.balance}</span>,
            <span className="text-xs text-muted-foreground">{c.chains.map(chainLabel).join(" / ")}</span>,
            <StatusBadge label={c.status} tone={statusTone(c.status)} />,
            <span className="num text-xs text-muted-foreground">{c.updated}</span>,
          ]}
        />
        <TablePagination testId="card-pagination" total={cards.length} />
      </Panel>

      <Panel
        title="卡片详情 / Card detail"
        subtitle={`当前选中 ${selected.id} · 所有敏感字段脱敏显示`}
        testId="panel-card-detail"
        actions={
          <>
            <SideEffectAction
              testId="card-freeze"
              label="冻结 Freeze"
              icon={<Snowflake className="mr-1.5 h-3.5 w-3.5" />}
              description="冻结将立即拒绝该卡的所有授权请求。"
            />
            <SideEffectAction
              testId="card-close"
              label="销卡 Close"
              destructive
              icon={<Ban className="mr-1.5 h-3.5 w-3.5" />}
              description="销卡不可逆，需二次确认并记录操作审计。"
            />
          </>
        }
      >
        <Tabs defaultValue="basic">
          <div className="px-4 pt-4">
            <TabsList data-testid="card-detail-tabs" className="flex-wrap">
              <TabsTrigger value="basic" data-testid="card-detail-tab-basic">基础信息 Basic</TabsTrigger>
              <TabsTrigger value="deposits" data-testid="card-detail-tab-deposits">USDT 充值 Deposits</TabsTrigger>
              <TabsTrigger value="spend" data-testid="card-detail-tab-spend">卡消费 Spend</TabsTrigger>
              <TabsTrigger value="cashout" data-testid="card-detail-tab-cashout">取现 Cash-out</TabsTrigger>
              <TabsTrigger value="third-party" data-testid="card-detail-tab-third-party">第三方支付 Third-party</TabsTrigger>
              <TabsTrigger value="referral" data-testid="card-detail-tab-referral">推荐分润 Referral</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="basic" className="mt-2">
            <DefinitionList
              testId="card-detail-fields"
              items={[
                { label: "卡 ID / Card ID", value: selected.id },
                { label: "卡号 / PAN", masked: true },
                { label: "CVV", masked: true },
                { label: "有效期 / Expiry", masked: true },
                { label: "卡形态 / Form", value: selected.form },
                { label: "持卡人 / Holder", value: selected.holder },
                { label: "发卡行 / Issuing bank", value: `${selected.bank} · ${selected.currency}` },
                { label: "法币余额 / Balance", value: `${selected.balance} ${selected.currency}` },
                { label: "充值公链 / Chains", value: selected.chains.map(chainLabel).join(" / ") },
                { label: "状态 / Status", value: <StatusBadge label={selected.status} tone={statusTone(selected.status)} /> },
                { label: "所属租户 / Tenant", value: selected.tenant },
                { label: "更新时间 / Updated", value: selected.updated },
              ]}
            />
            <FormSection
              titleZh="继承的产品模板与费率"
              titleEn="Inherited product template & fees"
              testId="section-card-template"
              badge={
                <StatusBadge
                  label={overrideFees ? "单卡覆盖 OVERRIDE" : "模板默认 TEMPLATE DEFAULT"}
                  tone={overrideFees ? "warning" : "info"}
                />
              }
            >
              <div className="mb-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <FieldRow label="继承模板 Template" hint={`发卡行 ${template.bank} · 结算币种 ${template.currency}`}>
                  <p data-testid="card-template-name" className="text-sm font-medium text-foreground">
                    {template.name}
                  </p>
                </FieldRow>
                <SwitchField
                  testId="card-override-fees"
                  labelZh="覆盖模板费率"
                  labelEn="Override template fees"
                  description="开启后允许单独修改本张卡片费率，所有数值不可超过所属产品模板定义的费率上限。"
                  checked={overrideFees}
                  onCheckedChange={setOverrideFees}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <RateField
                  capKey="usdtDepositRate"
                  testId="card-fee-usdt-deposit"
                  defaultValue={String(template.fees.usdtDepositRate)}
                  parentCap={template.fees.usdtDepositRate}
                  parentLabel="产品模板上限"
                  disabled={!overrideFees}
                />
                <RateField
                  capKey="cardSpendRate"
                  testId="card-fee-spend"
                  defaultValue={String(template.fees.cardSpendRate)}
                  parentCap={template.fees.cardSpendRate}
                  parentLabel="产品模板上限"
                  disabled={!overrideFees}
                />
                <RateField
                  capKey="assetWithdrawRate"
                  testId="card-fee-asset-withdraw"
                  defaultValue={String(template.fees.assetWithdrawRate)}
                  parentCap={template.fees.assetWithdrawRate}
                  parentLabel="产品模板上限"
                  disabled={!overrideFees}
                />
                <RateField
                  capKey="cashWithdrawRate"
                  testId="card-fee-cash-withdraw"
                  defaultValue={String(template.fees.cashWithdrawRate)}
                  parentCap={template.fees.cashWithdrawRate}
                  parentLabel="产品模板上限"
                  disabled={!overrideFees}
                />
                <RateField
                  capKey="thirdPartyPayRate"
                  testId="card-fee-third-party"
                  defaultValue={String(template.fees.thirdPartyPayRate)}
                  parentCap={template.fees.thirdPartyPayRate}
                  parentLabel="产品模板上限"
                  disabled={!overrideFees}
                />
                <RateField
                  capKey="referralRate"
                  testId="card-fee-referral"
                  labelZh="本卡推荐分润费率"
                  defaultValue={String(template.fees.referralRate)}
                  parentCap={template.fees.referralRate}
                  parentLabel="产品模板上限"
                  disabled={!overrideFees}
                />
              </div>
              <div className="mt-3 flex justify-end">
                <SideEffectAction
                  testId="card-fee-override-save"
                  label="保存单卡费率 Save"
                  description="当前为 SANDBOX 预览；配置保存将在 FastLink 后端 API 契约接入后启用，当前不执行写入。"
                  changes={[
                    { label: "费率来源 Fee source", before: "模板默认 Template default", after: overrideFees ? "单卡覆盖 Card override" : "模板默认 Template default" },
                  ]}
                />
              </div>
            </FormSection>
          </TabsContent>

          <TabsContent value="deposits" className="mt-2">
            <MockTable
              testId="card-deposits-table"
              minWidth={1180}
              columns={["时间 Time", "充值单号 ID", "公链 Chain", "交易 Hash", "来源地址 From", "USDT 金额", "汇率 Rate", "手续费 Fee", "兑换法币 Fiat", "状态 Status"]}
              rows={deposits}
              rowKey={(d) => d.id}
              emptyDescription="该卡片暂无 USDT 链上充值记录。"
              renderRow={(d) => [
                <span className="num text-xs">{d.time}</span>,
                d.id,
                chainLabel(d.chain),
                <CopyableText value={d.hash} testId={`deposit-hash-${d.id}`} label="交易 Hash" />,
                <CopyableText value={d.from} testId={`deposit-from-${d.id}`} label="来源地址" />,
                <span className="num">{d.usdt}</span>,
                <span className="num">{d.rate}</span>,
                <span className="num">{d.fee}</span>,
                <span className="num">{d.fiat} {d.currency}</span>,
                <StatusBadge label={d.status} tone={statusTone(d.status)} />,
              ]}
            />
          </TabsContent>

          <TabsContent value="spend" className="mt-2">
            <MockTable
              testId="card-spend-table"
              columns={["时间 Time", "交易 ID", "商户 Merchant", "金额 Amount", "手续费 Fee", "状态 Status"]}
              rows={spend}
              rowKey={(s) => s.id}
              minWidth={760}
              emptyDescription="该卡片暂无消费流水。"
              renderRow={(s) => [
                <span className="num text-xs">{s.time}</span>,
                s.id,
                s.merchant,
                <span className="num">{s.amount} {s.currency}</span>,
                <span className="num">{s.fee}</span>,
                <StatusBadge label={s.status} tone={statusTone(s.status)} />,
              ]}
            />
          </TabsContent>

          <TabsContent value="cashout" className="mt-2">
            <MockTable
              testId="card-cashout-table"
              columns={["时间 Time", "单号 ID", "类型 Type", "金额 Amount", "手续费 Fee", "到账 Net", "状态 Status"]}
              rows={cashOut}
              rowKey={(w) => w.id}
              minWidth={860}
              emptyDescription="该卡片暂无银行卡取现流水。"
              renderRow={(w) => [
                <span className="num text-xs">{w.time}</span>,
                w.id,
                w.kind,
                <span className="num">{w.amount} {w.currency}</span>,
                <span className="num">{w.fee}</span>,
                <span className="num">{w.net}</span>,
                <StatusBadge label={w.status} tone={statusTone(w.status)} />,
              ]}
            />
          </TabsContent>

          <TabsContent value="third-party" className="mt-2">
            <MockTable
              testId="card-third-party-table"
              columns={["时间 Time", "交易 ID", "第三方应用 App", "金额 Amount", "手续费 Fee", "状态 Status"]}
              rows={thirdParty}
              rowKey={(s) => s.id}
              minWidth={800}
              emptyDescription="该卡片暂无第三方应用支付流水。"
              renderRow={(s) => [
                <span className="num text-xs">{s.time}</span>,
                s.id,
                s.merchant,
                <span className="num">{s.amount} {s.currency}</span>,
                <span className="num">{s.fee}</span>,
                <StatusBadge label={s.status} tone={statusTone(s.status)} />,
              ]}
            />
          </TabsContent>

          <TabsContent value="referral" className="mt-2">
            <MockTable
              testId="card-referral-table"
              minWidth={1080}
              columns={["时间 Time", "分润单号 ID", "上级 Upline", "下级 Downline", "来源 Source", "计费基数 Base", "费率 Rate", "上限 Cap", "分润金额 Amount", "边界校验 Boundary"]}
              rows={referrals}
              rowKey={(r) => r.id}
              emptyDescription="该卡片暂无推荐分润记录。"
              renderRow={(r) => [
                <span className="num text-xs">{r.time}</span>,
                r.id,
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
          </TabsContent>
        </Tabs>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button size="sm" variant="outline" data-testid="card-detail-refresh" onClick={() => setSelected(selected)}>
            刷新 Refresh
          </Button>
        </div>
      </Panel>
    </div>
  );
}
