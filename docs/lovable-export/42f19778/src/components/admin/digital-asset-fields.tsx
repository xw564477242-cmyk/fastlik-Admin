import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHAINS, FEE_CAPS, type ChainId, type FeeCapKey } from "@/lib/admin-chains";
import { cn } from "@/lib/utils";

/* ------------------------- Global chain select ---------------------------- */

/**
 * Reusable public-chain selector — used by product configuration, card
 * application, treasury filters, chain parameters and hot wallets.
 */
export function ChainSelect({
  value,
  onValueChange,
  testId = "chain-select",
  placeholder = "选择公链 Select chain",
  includeAll = false,
  disabled = false,
  className,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  testId?: string;
  placeholder?: string;
  includeAll?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger data-testid={testId} className={cn("h-9 w-[190px] text-sm", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll ? <SelectItem value="all">全部公链 All chains</SelectItem> : null}
        {CHAINS.map((c) => (
          <SelectItem key={c.id} value={c.id} disabled={!c.enabled}>
            {c.label} · {c.network}
            {c.enabled ? "" : " (未启用)"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Multi-chain toggle group for "允许的充值公链". */
export function ChainToggles({
  value,
  onChange,
  testId = "chain-toggles",
  disabled = false,
}: {
  value: ChainId[];
  onChange: (next: ChainId[]) => void;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <div data-testid={testId} className="flex flex-wrap gap-2">
      {CHAINS.map((c) => {
        const on = value.includes(c.id);
        return (
          <Button
            key={c.id}
            type="button"
            size="sm"
            variant={on ? "default" : "outline"}
            disabled={disabled}
            data-testid={`${testId}-${c.id}`}
            className="h-8"
            onClick={() =>
              onChange(on ? value.filter((v) => v !== c.id) : [...value, c.id])
            }
          >
            {c.label}
          </Button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Copy button ------------------------------- */

/** Hash / wallet address cell with one-click copy. */
export function CopyableText({
  value,
  truncate = true,
  testId,
  label,
}: {
  value: string;
  truncate?: boolean;
  testId: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const empty = !value || value === "—";

  if (empty) return <span className="text-muted-foreground">—</span>;

  const shown =
    truncate && value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;

  return (
    <span className="inline-flex max-w-full items-center gap-1.5" data-testid={testId}>
      <span className="num truncate text-xs text-foreground" title={value}>
        {shown}
      </span>
      <button
        type="button"
        aria-label={label ? `复制 ${label}` : "复制 Copy"}
        data-testid={`${testId}-copy`}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </span>
  );
}

/* --------------------------------- Fields -------------------------------- */

export function FieldRow({
  label,
  hint,
  children,
  testId,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Switch row used for every capability / feature toggle. */
export function SwitchField({
  labelZh,
  labelEn,
  description,
  defaultChecked = false,
  testId,
  onCheckedChange,
  checked,
}: {
  labelZh: string;
  labelEn: string;
  description?: string;
  defaultChecked?: boolean;
  testId: string;
  checked?: boolean;
  onCheckedChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface/40 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{labelZh}</p>
        <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{labelEn}</p>
        {description ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Switch
        data-testid={testId}
        defaultChecked={defaultChecked}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

/**
 * Fee / rate input. Always renders the platform ceiling and flags any value
 * that exceeds it — boundary control is a hard business rule.
 */
export function RateField({
  capKey,
  labelZh,
  defaultValue = "",
  testId,
  suffix,
  disabled = false,
  value: controlled,
  onChange,
  parentCap,
  parentLabel = "上级上限",
}: {
  capKey: FeeCapKey;
  labelZh?: string;
  defaultValue?: string;
  testId: string;
  suffix?: string;
  disabled?: boolean;
  /** Controlled value — enables before/after diffing in the save dialog. */
  value?: string;
  onChange?: (next: string) => void;
  /** Tenant / product-template ceiling that further constrains the platform cap. */
  parentCap?: number;
  parentLabel?: string;
}) {
  const cap = FEE_CAPS[capKey];
  const [internal, setInternal] = useState(defaultValue);
  const value = controlled ?? internal;
  const setValue = (next: string) => {
    setInternal(next);
    onChange?.(next);
  };
  const numeric = Number(value);
  const effectiveCap =
    typeof parentCap === "number" ? Math.min(cap.max, parentCap) : cap.max;
  const over = value !== "" && Number.isFinite(numeric) && numeric > effectiveCap;
  const boundedByParent = effectiveCap < cap.max;
  const unit = suffix ?? cap.unit;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground" htmlFor={testId}>
        {labelZh ?? cap.labelZh}
        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{cap.labelEn}</span>
      </Label>
      <div className="relative">
        <Input
          id={testId}
          data-testid={testId}
          inputMode="decimal"
          disabled={disabled}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0.00"
          className={cn("h-9 pr-14 text-sm", over && "border-destructive focus-visible:ring-destructive/40")}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          {unit}
        </span>
      </div>
      <p
        data-testid={`${testId}-cap`}
        className={cn("text-[11px]", over ? "text-destructive" : "text-muted-foreground")}
      >
        {over
          ? `超出${boundedByParent ? parentLabel : "平台上限"} Exceeds cap ${effectiveCap}${unit}，保存将被拒绝。`
          : boundedByParent
            ? `平台上限 Max ${cap.max}${unit} · ${parentLabel} ${effectiveCap}${unit}（生效边界）`
            : `平台上限 Max ${cap.max}${unit}`}
      </p>
    </div>
  );
}

/** Section heading inside a configuration form. */
export function FormSection({
  titleZh,
  titleEn,
  badge,
  children,
  testId,
}: {
  titleZh: string;
  titleEn: string;
  badge?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section data-testid={testId} className="border-b border-border px-4 py-4 last:border-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{titleZh}</h3>
        <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          {titleEn}
        </span>
        {badge}
      </div>
      {children}
    </section>
  );
}
