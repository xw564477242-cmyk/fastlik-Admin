import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Any operation with side effects (freeze card, close a day, refund, ...).
 * The button is kept for the final contract, but confirming never executes:
 * it surfaces the "待开发 / 当前验收不执行" notice instead.
 */
export function SideEffectAction({
  label,
  description,
  destructive,
  testId,
  icon,
  changes,
}: {
  label: string;
  description?: string;
  destructive?: boolean;
  testId: string;
  icon?: ReactNode;
  /** Optional before/after diff preview (rate & commission changes). */
  changes?: { label: string; before: string; after: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant={destructive ? "destructive" : "outline"}
        data-testid={testId}
        onClick={() => {
          setConfirmed(false);
          setOpen(true);
        }}
      >
        {icon}
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid={`${testId}-dialog`} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle
                className={destructive ? "h-4 w-4 text-destructive" : "h-4 w-4 text-warning"}
              />
              {label}
            </DialogTitle>
            <DialogDescription>
              {description ?? "该操作会产生副作用，需二次确认。"}
            </DialogDescription>
          </DialogHeader>

          {changes && changes.length > 0 ? (
            <div
              data-testid={`${testId}-diff`}
              className="overflow-x-auto rounded-md border border-border"
            >
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/60">
                    {["参数 Field", "修改前 Before", "修改后 After"].map((c) => (
                      <th
                        key={c}
                        scope="col"
                        className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.label} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 text-foreground">{c.label}</td>
                      <td className="num px-3 py-2 text-muted-foreground">{c.before}</td>
                      <td
                        className={
                          c.before === c.after
                            ? "num px-3 py-2 text-muted-foreground"
                            : "num px-3 py-2 font-medium text-warning"
                        }
                      >
                        {c.after}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="space-y-2 rounded-md border border-border bg-surface/60 p-3 text-xs text-muted-foreground">
            <p>
              环境: <span className="num text-warning">SANDBOX</span> · 操作后端接口尚未接入。
            </p>
            <p className="num">
              HTTP Status: <span data-testid={`${testId}-http`}>—</span> · Trace ID:{" "}
              <span data-testid={`${testId}-trace`}>—</span>
            </p>
          </div>

          {confirmed ? (
            <p
              data-testid={`${testId}-result`}
              className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-xs text-info"
            >
              待开发 / 当前验收不执行 — Backend contract missing, no request was sent.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              data-testid={`${testId}-cancel`}
              onClick={() => setOpen(false)}
            >
              取消 Cancel
            </Button>
            <Button
              size="sm"
              variant={destructive ? "destructive" : "default"}
              data-testid={`${testId}-confirm`}
              onClick={() => setConfirmed(true)}
            >
              确认 Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
