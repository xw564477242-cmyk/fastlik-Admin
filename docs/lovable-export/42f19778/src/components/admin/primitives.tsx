import type { ReactNode } from "react";
import { RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ---------------------------------- Page --------------------------------- */

export function PageHeader({
  titleZh,
  titleEn,
  description,
  actions,
  meta,
}: {
  titleZh: string;
  titleEn: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header
      data-testid="page-header"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-border pb-5 sm:flex sm:flex-wrap sm:justify-between"
    >
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
          {titleZh}
        </h1>
        <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {titleEn}
        </p>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
        {meta}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  testId,
  className,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cn("rounded-lg border border-border bg-card", className)}
    >
      {title ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 sm:flex sm:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* --------------------------------- Status -------------------------------- */

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "pending";

const toneClasses: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/40 bg-success/12 text-success",
  warning: "border-warning/40 bg-warning/12 text-warning",
  danger: "border-destructive/40 bg-destructive/12 text-destructive",
  info: "border-info/40 bg-info/12 text-info",
  pending: "border-border bg-secondary text-foreground",
};

export function StatusBadge({
  label,
  tone = "neutral",
  testId,
}: {
  label: string;
  tone?: Tone;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        toneClasses[tone],
      )}
    >
      {label}
    </span>
  );
}

export function EnvBadge() {
  return <StatusBadge label="SANDBOX" tone="warning" testId="env-badge" />;
}

export function PendingTag() {
  return <StatusBadge label="待开发 Pending" tone="info" />;
}

/* --------------------------------- Metric -------------------------------- */

export function MetricCard({
  labelZh,
  labelEn,
  source,
  testId,
}: {
  labelZh: string;
  labelEn: string;
  source: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-border bg-card p-4"
    >
      <p className="text-xs font-medium text-muted-foreground">{labelZh}</p>
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
        {labelEn}
      </p>
      <p className="num mt-3 text-2xl font-semibold text-muted-foreground/60" data-testid={`${testId}-value`}>
        —
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">暂无数据 · awaiting {source}</p>
    </div>
  );
}

/* --------------------------------- Filters ------------------------------- */

export type FilterOption = { value: string; label: string };

export function FilterBar({
  searchPlaceholder = "搜索 Search",
  filters = [],
  onRefresh,
  extra,
  testId = "filter-bar",
}: {
  searchPlaceholder?: string;
  filters?: { id: string; label: string; options: FilterOption[] }[];
  onRefresh?: () => void;
  extra?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3"
    >
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid={`${testId}-search`}
          placeholder={searchPlaceholder}
          className="h-9 pl-8 text-sm"
        />
      </div>
      {filters.map((f) => (
        <Select key={f.id}>
          <SelectTrigger
            data-testid={`${testId}-${f.id}`}
            className="h-9 w-[170px] text-sm"
          >
            <SelectValue placeholder={f.label} />
          </SelectTrigger>
          <SelectContent>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {extra}
      {onRefresh ? (
        <Button
          size="sm"
          variant="outline"
          data-testid={`${testId}-refresh`}
          onClick={onRefresh}
          className="h-9"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          刷新 Refresh
        </Button>
      ) : null}
    </div>
  );
}

/* -------------------------------- Data table ----------------------------- */

export function DataTableShell({
  columns,
  state,
  testId,
}: {
  columns: string[];
  /** Rendered inside the table body area: loading / empty / error / pending. */
  state: ReactNode;
  testId: string;
}) {
  return (
    <div data-testid={testId} className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface/60">
            {columns.map((c) => (
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
          <tr>
            <td colSpan={columns.length} className="p-0">
              {state}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function TablePagination({
  testId = "pagination",
  total = 0,
  from = 0,
  to = 0,
}: {
  testId?: string;
  total?: number;
  from?: number;
  to?: number;
}) {
  const shownFrom = total > 0 && from === 0 ? 1 : from;
  const shownTo = total > 0 && to === 0 ? total : to;
  return (
    <div
      data-testid={testId}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground"
    >
      <span data-testid={`${testId}-summary`} className="num">
        {shownFrom} – {shownTo} / {total}
      </span>
      <div className="flex items-center gap-2">
        <Select>
          <SelectTrigger data-testid={`${testId}-page-size`} className="h-8 w-[110px]">
            <SelectValue placeholder="20 / 页" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20 / 页</SelectItem>
            <SelectItem value="50">50 / 页</SelectItem>
            <SelectItem value="100">100 / 页</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8" disabled data-testid={`${testId}-prev`}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="h-8" disabled data-testid={`${testId}-next`}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* --------------------------- Request status strip ------------------------ */

export function RequestStatusLine({
  label,
  httpStatus = "—",
  traceId = "—",
  tone = "neutral",
  statusLabel = "未接入 Not connected",
  testId,
}: {
  label: string;
  httpStatus?: string | number;
  traceId?: string;
  tone?: Tone;
  statusLabel?: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface/50 px-3 py-2 text-xs"
    >
      <span className="font-medium text-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge label={statusLabel} tone={tone} />
        <span className="num text-[11px] text-muted-foreground">
          HTTP <span data-testid={`${testId}-http`}>{httpStatus}</span> · Trace{" "}
          <span data-testid={`${testId}-trace`}>{traceId}</span>
        </span>
      </div>
    </div>
  );
}

/* ---------------------------- Definition list ---------------------------- */

export function DefinitionList({
  items,
  testId,
}: {
  items: { label: string; value?: ReactNode; masked?: boolean }[];
  testId?: string;
}) {
  return (
    <dl
      data-testid={testId}
      className="grid grid-cols-1 gap-x-8 gap-y-3 p-4 sm:grid-cols-2"
    >
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            {i.label}
          </dt>
          <dd className="mt-0.5 truncate text-sm text-foreground">
            {i.masked ? (
              <span className="num text-muted-foreground">•••• 已脱敏 Masked</span>
            ) : (
              (i.value ?? <span className="text-muted-foreground">暂无数据</span>)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
