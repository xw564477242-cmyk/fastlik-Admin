import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DataTableShell,
  DefinitionList,
  FilterBar,
  PageHeader,
  Panel,
  TablePagination,
} from "@/components/admin/primitives";
import { SideEffectAction } from "@/components/admin/side-effect-action";
import { EmptyState } from "@/components/admin/states";

export const Route = createFileRoute("/admin/end-users")({
  component: EndUsersPage,
});

function EndUsersPage() {
  return (
    <>
      <PageHeader
        titleZh="终端用户运营"
        titleEn="End User Operations"
        description="按租户检索终端用户，查看 KYC 状态、钱包与卡片归属。个人敏感信息默认脱敏。"
      />

      <Panel title="用户检索 / User search" testId="panel-end-user-list">
        <FilterBar
          testId="end-user-filter"
          searchPlaceholder="用户 ID / 邮箱 / 手机号"
          filters={[
            {
              id: "kyc",
              label: "KYC 状态",
              options: [
                { value: "none", label: "未提交 Not submitted" },
                { value: "review", label: "审核中 In review" },
                { value: "approved", label: "已通过 Approved" },
                { value: "rejected", label: "已拒绝 Rejected" },
              ],
            },
            {
              id: "status",
              label: "账户状态",
              options: [
                { value: "active", label: "Active" },
                { value: "restricted", label: "Restricted" },
                { value: "closed", label: "Closed" },
              ],
            },
          ]}
          onRefresh={() => {}}
        />
        <DataTableShell
          testId="end-user-table"
          columns={[
            "用户 ID",
            "所属租户 Tenant",
            "KYC 状态",
            "钱包 Wallets",
            "卡片 Cards",
            "注册时间 Registered",
          ]}
          state={<EmptyState description="用户接口尚未接入，不展示模拟用户。" />}
        />
        <TablePagination testId="end-user-pagination" />
      </Panel>

      <Panel
        title="用户详情 / User detail"
        testId="panel-end-user-detail"
        actions={
          <>
            <Button asChild size="sm" variant="outline" data-testid="end-user-view-cards">
              <Link to="/admin/card-center" search={{ user: "U-88420" }}>
                <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                查看名下卡片 Cards
              </Link>
            </Button>
            <SideEffectAction
              testId="end-user-restrict"
              label="限制账户 Restrict"
              description="限制后用户将无法发起交易。"
            />
            <SideEffectAction
              testId="end-user-reset-mfa"
              label="重置 MFA"
              destructive
              description="重置 MFA 会解绑用户当前的双因素设备。"
            />
          </>
        }
      >
        <DefinitionList
          testId="end-user-detail-fields"
          items={[
            { label: "用户 ID" },
            { label: "所属租户 / Tenant" },
            { label: "姓名 / Name", masked: true },
            { label: "证件号 / Document", masked: true },
            { label: "邮箱 / Email", masked: true },
            { label: "手机号 / Phone", masked: true },
            { label: "KYC 状态" },
            { label: "账户状态" },
          ]}
        />
      </Panel>
    </>
  );
}
