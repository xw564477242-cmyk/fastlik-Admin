import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/states";

/**
 * Table shell that renders mock rows, and falls back to the shared
 * loading / empty / error states. Mock preview only — no API calls.
 */
export function MockTable<T>({
  columns,
  rows,
  renderRow,
  rowKey,
  testId,
  minWidth = 960,
  loading = false,
  error = false,
  emptyDescription,
}: {
  columns: string[];
  rows: T[];
  renderRow: (row: T) => ReactNode[];
  rowKey: (row: T, index: number) => string;
  testId: string;
  minWidth?: number;
  loading?: boolean;
  error?: boolean;
  emptyDescription?: string;
}) {
  const fallback = loading ? (
    <LoadingState />
  ) : error ? (
    <ErrorState httpStatus={500} traceId="mock-trace" />
  ) : rows.length === 0 ? (
    <EmptyState description={emptyDescription} />
  ) : null;

  return (
    <div className="overflow-x-auto">
      <table
        data-testid={testId}
        className="w-full border-collapse text-sm"
        style={{ minWidth: `${minWidth}px` }}
      >
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
          {fallback ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {fallback}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                data-testid={`${testId}-row-${i}`}
                className="border-b border-border/60 last:border-0 hover:bg-surface/40"
              >
                {renderRow(row).map((cell, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      "px-4 py-2.5 align-middle",
                      ci === 0 ? "whitespace-nowrap font-medium text-foreground" : "text-foreground",
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Small mock KPI card (values are mock, unlike MetricCard which is empty). */
export function MockMetric({
  labelZh,
  labelEn,
  value,
  hint,
  testId,
}: {
  labelZh: string;
  labelEn: string;
  value: string;
  hint?: string;
  testId: string;
}) {
  return (
    <div data-testid={testId} className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{labelZh}</p>
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">{labelEn}</p>
      <p className="num mt-3 text-2xl font-semibold text-foreground" data-testid={`${testId}-value`}>
        {value}
      </p>
      {hint ? <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
