import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, interactive, ...props }: ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border border-line bg-surface shadow-card",
        interactive && "transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-lift",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6", className)}>
      <div className="min-w-0 space-y-1">
        <h2 className="text-base font-semibold text-ink-950">{title}</h2>
        {description ? <p className="text-sm text-ink-600">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center gap-3 border-t border-line px-5 py-4 sm:px-6", className)} {...props} />;
}
