import type { ReactNode } from "react";
import {
  Inbox,
  Loader2,
  AlertTriangle,
  Lock,
  Hammer,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function Frame({
  testId,
  icon,
  tone = "muted",
  title,
  description,
  children,
}: {
  testId: string;
  icon: ReactNode;
  tone?: "muted" | "danger" | "warning" | "info";
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : tone === "info"
          ? "text-info"
          : "text-muted-foreground";
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    >
      <div className={`${toneClass}`}>{icon}</div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? (
        <div className="max-w-md text-xs leading-relaxed text-muted-foreground">
          {description}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function LoadingState({ label = "加载中 · Loading" }: { label?: string }) {
  return (
    <Frame
      testId="state-loading"
      icon={<Loader2 className="h-6 w-6 animate-spin" />}
      title={label}
      description="正在向 /api 请求数据。"
    />
  );
}

export function EmptyState({
  title = "暂无数据 · No data",
  description = "当前 Tenant 与 SANDBOX 环境下没有可显示的记录。",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Frame
      testId="state-empty"
      icon={<Inbox className="h-6 w-6" />}
      title={title}
      description={description}
    />
  );
}

export function ErrorState({
  httpStatus,
  traceId,
  onRetry,
  message = "请求失败 · Request failed",
}: {
  httpStatus?: number | string;
  traceId?: string;
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <Frame
      testId="state-error"
      tone="danger"
      icon={<AlertTriangle className="h-6 w-6" />}
      title={message}
      description={
        <div className="space-y-1">
          <p>接口未接入或返回错误时，此处显示原始状态，不会生成替代数据。</p>
          <p className="num text-[11px]">
            HTTP Status: <span data-testid="error-http-status">{httpStatus ?? "—"}</span>
            {"  ·  "}
            Trace ID: <span data-testid="error-trace-id">{traceId ?? "—"}</span>
          </p>
        </div>
      }
    >
      {onRetry ? (
        <Button size="sm" variant="outline" data-testid="state-error-retry" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          重试 Retry
        </Button>
      ) : null}
    </Frame>
  );
}

export function ForbiddenState({ traceId }: { traceId?: string }) {
  return (
    <Frame
      testId="state-forbidden"
      tone="warning"
      icon={<Lock className="h-6 w-6" />}
      title="无权限 · Not authorised"
      description={
        <div className="space-y-1">
          <p>当前管理员角色没有访问该资源的权限。请联系 Platform Admin 调整 RBAC 授权。</p>
          <p className="num text-[11px]">
            HTTP Status: <span data-testid="error-http-status">403</span>
            {"  ·  "}Trace ID: <span data-testid="error-trace-id">{traceId ?? "—"}</span>
          </p>
        </div>
      }
    />
  );
}

export function PendingBackendState({
  title = "待开发 · Backend Contract Missing",
  description = "该模块的后端接口尚未定义。页面入口已保留，接入契约后即可渲染真实数据。",
  endpoint,
}: {
  title?: string;
  description?: string;
  endpoint?: string;
}) {
  return (
    <Frame
      testId="state-pending-backend"
      tone="info"
      icon={<Hammer className="h-6 w-6" />}
      title={title}
      description={
        <div className="space-y-1">
          <p>{description}</p>
          {endpoint ? (
            <p className="num text-[11px]">预留接口 Endpoint: {endpoint}</p>
          ) : null}
          <p className="num text-[11px]">
            HTTP Status: <span data-testid="error-http-status">—</span>
            {"  ·  "}Trace ID: <span data-testid="error-trace-id">—</span>
          </p>
        </div>
      }
    />
  );
}
