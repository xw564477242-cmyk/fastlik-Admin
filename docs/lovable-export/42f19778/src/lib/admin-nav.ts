import {
  LayoutDashboard,
  Building2,
  Boxes,
  Activity,
  Landmark,
  Plug,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

export type NavStatus = "ready" | "pending";

/** Second-level tab inside a first-level module. */
export type NavTab = {
  id: string;
  to: string;
  labelZh: string;
  labelEn: string;
  status: NavStatus;
};

/** First-level module. The sidebar is fixed at 7 of these. */
export type NavModule = {
  id: string;
  to: string;
  labelZh: string;
  labelEn: string;
  icon: LucideIcon;
  tabs: NavTab[];
};

export const NAV_MODULES: NavModule[] = [
  {
    id: "overview",
    to: "/admin/overview",
    labelZh: "总览",
    labelEn: "Overview",
    icon: LayoutDashboard,
    tabs: [
      {
        id: "overview-summary",
        to: "/admin/overview",
        labelZh: "平台摘要",
        labelEn: "Platform Summary",
        status: "ready",
      },
    ],
  },
  {
    id: "tenants",
    to: "/admin/tenants",
    labelZh: "租户与白标",
    labelEn: "Tenants & White Label",
    icon: Building2,
    tabs: [
      { id: "tenant-list", to: "/admin/tenants", labelZh: "Tenant", labelEn: "Tenants", status: "ready" },
      {
        id: "brands",
        to: "/admin/brands",
        labelZh: "Brand / White Label",
        labelEn: "Brand / White Label",
        status: "pending",
      },
      {
        id: "oem-odm",
        to: "/admin/oem-odm",
        labelZh: "OEM / ODM 项目",
        labelEn: "OEM / ODM Projects",
        status: "pending",
      },
      {
        id: "tenant-admins",
        to: "/admin/tenant-admins",
        labelZh: "Tenant 管理员",
        labelEn: "Tenant Administrators",
        status: "pending",
      },
      {
        id: "delivery",
        to: "/admin/delivery",
        labelZh: "交付进度",
        labelEn: "Delivery Progress",
        status: "pending",
      },
    ],
  },
  {
    id: "products",
    to: "/admin/products",
    labelZh: "产品与项目",
    labelEn: "Products & Programs",
    icon: Boxes,
    tabs: [
      { id: "catalogue", to: "/admin/products", labelZh: "产品目录", labelEn: "Catalogue", status: "ready" },
      { id: "programs", to: "/admin/programs", labelZh: "Program", labelEn: "Programs", status: "pending" },
      {
        id: "capabilities",
        to: "/admin/capabilities",
        labelZh: "能力开通",
        labelEn: "Capability Enablement",
        status: "pending",
      },
      {
        id: "pricing",
        to: "/admin/pricing",
        labelZh: "费率与限额",
        labelEn: "Pricing & Limits",
        status: "pending",
      },
      { id: "limits", to: "/admin/limits", labelZh: "限额控制", labelEn: "Limits & Controls", status: "pending" },
    ],
  },
  {
    id: "operations",
    to: "/admin/wallets",
    labelZh: "业务运营",
    labelEn: "Business Operations",
    icon: Activity,
    tabs: [
      { id: "wallets", to: "/admin/wallets", labelZh: "钱包", labelEn: "Wallets", status: "pending" },
      { id: "cards", to: "/admin/card-center", labelZh: "卡片", labelEn: "Cards", status: "ready" },
      {
        id: "card-history",
        to: "/admin/card-history",
        labelZh: "卡片历史",
        labelEn: "Card History",
        status: "ready",
      },
      {
        id: "transactions",
        to: "/admin/transactions",
        labelZh: "统一交易",
        labelEn: "Unified Transactions",
        status: "pending",
      },
      {
        id: "merchants",
        to: "/admin/merchants",
        labelZh: "商户与支付",
        labelEn: "Merchants & Payments",
        status: "ready",
      },
      { id: "end-users", to: "/admin/end-users", labelZh: "终端用户", labelEn: "End Users", status: "ready" },
      { id: "cases", to: "/admin/cases", labelZh: "异常与案件", labelEn: "Exceptions & Cases", status: "pending" },
    ],
  },
  {
    id: "treasury",
    to: "/admin/funds",
    labelZh: "资金与对账",
    labelEn: "Treasury & Reconciliation",
    icon: Landmark,
    tabs: [
      { id: "funds", to: "/admin/funds", labelZh: "资金账户", labelEn: "Fund Accounts", status: "pending" },
      {
        id: "reconciliation",
        to: "/admin/treasury",
        labelZh: "Reconciliation",
        labelEn: "Reconciliation",
        status: "ready",
      },
      { id: "ledger", to: "/admin/ledger", labelZh: "Trial Balance", labelEn: "Trial Balance", status: "pending" },
      {
        id: "daily-closing",
        to: "/admin/daily-closing",
        labelZh: "Daily Closing",
        labelEn: "Daily Closing",
        status: "pending",
      },
      {
        id: "settlement-calendar",
        to: "/admin/settlement-calendar",
        labelZh: "批次与日历",
        labelEn: "Batches & Calendar",
        status: "pending",
      },
      {
        id: "chain-config",
        to: "/admin/chain-config",
        labelZh: "链参数配置",
        labelEn: "Chain Parameters",
        status: "ready",
      },
      {
        id: "hot-wallets",
        to: "/admin/hot-wallets",
        labelZh: "热钱包管理",
        labelEn: "Hot Wallets",
        status: "ready",
      },
    ],
  },
  {
    id: "providers",
    to: "/admin/providers",
    labelZh: "服务提供商",
    labelEn: "Service Providers",
    icon: Plug,
    tabs: [
      { id: "provider-list", to: "/admin/providers", labelZh: "Provider", labelEn: "Providers", status: "pending" },
      { id: "routing", to: "/admin/routing", labelZh: "业务路由", labelEn: "Routing", status: "pending" },
    ],
  },
  {
    id: "system",
    to: "/admin/risk",
    labelZh: "风险与系统",
    labelEn: "Risk & System",
    icon: ShieldAlert,
    tabs: [
      { id: "risk", to: "/admin/risk", labelZh: "风险事件", labelEn: "Risk Events", status: "ready" },
      { id: "roles", to: "/admin/roles", labelZh: "用户与权限", labelEn: "Users & Permissions", status: "ready" },
      { id: "monitoring", to: "/admin/monitoring", labelZh: "系统状态", labelEn: "System Health", status: "pending" },
      {
        id: "releases",
        to: "/admin/releases",
        labelZh: "发布与验收",
        labelEn: "Releases & Acceptance",
        status: "pending",
      },
      { id: "settings", to: "/admin/settings", labelZh: "审计与设置", labelEn: "Audit & Settings", status: "ready" },
      {
        id: "operation-logs",
        to: "/admin/operation-logs",
        labelZh: "操作日志",
        labelEn: "Operation Logs",
        status: "ready",
      },
      { id: "config", to: "/admin/config", labelZh: "配置与版本", labelEn: "Configuration", status: "pending" },
      {
        id: "notifications",
        to: "/admin/notifications",
        labelZh: "通知中心",
        labelEn: "Notifications",
        status: "pending",
      },
      { id: "sandbox", to: "/admin/sandbox", labelZh: "Developer Sandbox", labelEn: "Sandbox", status: "ready" },
      { id: "api-webhooks", to: "/admin/api-webhooks", labelZh: "API 与 Webhook", labelEn: "API & Webhooks", status: "ready" },
    ],
  },
];

export const NAV_TABS: NavTab[] = NAV_MODULES.flatMap((m) => m.tabs);

function matches(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(to + "/");
}

export function findNavTab(pathname: string): NavTab | undefined {
  return NAV_TABS.find((t) => pathname === t.to) ?? NAV_TABS.find((t) => matches(pathname, t.to));
}

export function findNavModule(pathname: string): NavModule | undefined {
  const exact = NAV_MODULES.find((m) => m.tabs.some((t) => t.to === pathname));
  if (exact) return exact;
  return NAV_MODULES.find((m) => m.tabs.some((t) => matches(pathname, t.to)));
}
