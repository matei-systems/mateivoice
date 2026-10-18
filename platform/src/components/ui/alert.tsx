import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, Info, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger" | "test" | "brand";

const styles: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: "border-info-200 bg-info-50 text-info-700", icon: <Info className="size-5" aria-hidden="true" /> },
  success: { box: "border-success-200 bg-success-50 text-success-700", icon: <CheckCircle2 className="size-5" aria-hidden="true" /> },
  warning: { box: "border-warning-200 bg-warning-50 text-warning-700", icon: <AlertTriangle className="size-5" aria-hidden="true" /> },
  danger: { box: "border-danger-200 bg-danger-50 text-danger-700", icon: <OctagonAlert className="size-5" aria-hidden="true" /> },
  test: { box: "border-test-200 bg-test-50 text-test-700", icon: <FlaskConical className="size-5" aria-hidden="true" /> },
  brand: { box: "border-brand-200 bg-brand-50 text-brand-800", icon: <Info className="size-5" aria-hidden="true" /> },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const style = styles[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3.5 text-sm", style.box, className)} role={tone === "danger" ? "alert" : undefined}>
      <span className="mt-px shrink-0">{style.icon}</span>
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-relaxed opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
