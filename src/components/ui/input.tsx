import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Input({
  className,
  icon,
  ...props
}: ComponentProps<"input"> & { icon?: ReactNode }) {
  return (
    <div className={cn("relative", className)}>
      {icon && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-faint [&_svg]:size-4">
          {icon}
        </span>
      )}
      <input
        className={cn(
          "h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink shadow-card transition-colors placeholder:text-faint",
          "hover:border-line-strong focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none",
          "aria-invalid:border-red-400",
          icon ? "pl-9" : undefined,
        )}
        {...props}
      />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
