import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Tabellen sind auf kleinen Bildschirmen horizontal scrollbar (ohne Seiten-Scroll). */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="-mx-px overflow-x-auto">
      <table className={cn("w-full min-w-[36rem] border-collapse text-left text-sm", className)} {...props} />
    </div>
  );
}

export function THead(props: ComponentProps<"thead">) {
  return <thead className="border-b border-line bg-brand-25 text-xs font-medium uppercase tracking-wide text-ink-600" {...props} />;
}

export function TH({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("px-4 py-3 font-medium whitespace-nowrap first:pl-5 last:pr-5", className)} {...props} />;
}

export function TBody(props: ComponentProps<"tbody">) {
  return <tbody className="divide-y divide-line" {...props} />;
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("transition-colors hover:bg-brand-25", className)} {...props} />;
}

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle text-ink-800 first:pl-5 last:pr-5", className)} {...props} />;
}
