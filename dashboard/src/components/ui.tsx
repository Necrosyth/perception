import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../lib/utils";

// ---- Primitive styling kit (shadcn-flavored, Hypotenuse-branded) ----

export function Button({
  variant = "ghost",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "outline" | "ghost" | "danger" | "amber";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" && "h-7 px-2.5 text-xs",
        size === "md" && "h-9 px-3.5",
        size === "lg" && "h-10 px-5",
        variant === "solid" && "bg-aina-teal text-aina-navy-deep hover:bg-aina-teal/85",
        variant === "outline" && "border border-aina-slate/30 text-aina-frost hover:border-aina-teal/60 hover:text-aina-teal",
        variant === "ghost" && "text-aina-slate hover:bg-aina-navy hover:text-aina-frost",
        variant === "danger" && "bg-aina-red/15 text-aina-red hover:bg-aina-red/25",
        variant === "amber" && "bg-aina-amber/15 text-aina-amber hover:bg-aina-amber/25",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  tone = "slate",
  className,
  children,
}: {
  tone?: "slate" | "teal" | "amber" | "red" | "navy";
  className?: string;
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    slate: "bg-aina-slate/15 text-aina-slate",
    teal: "bg-aina-teal/15 text-aina-teal",
    amber: "bg-aina-amber/15 text-aina-amber",
    red: "bg-aina-red/15 text-aina-red",
    navy: "bg-aina-navy text-aina-frost",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={cn("rounded-lg border border-aina-slate/15 bg-aina-navy/60", onClick && "cursor-pointer", className)}
    >
      {children}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-aina-slate/25 bg-aina-navy-deep/60 px-3 text-sm text-aina-frost placeholder:text-aina-slate/50 outline-none focus:border-aina-teal/70 focus:ring-1 focus:ring-aina-teal/30",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-aina-slate/25 bg-aina-navy-deep/60 px-2.5 text-sm text-aina-frost outline-none focus:border-aina-teal/70",
        className,
      )}
      {...props}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
        checked ? "bg-aina-teal" : "bg-aina-slate/25",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-aina-frost shadow transition-all",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-aina-slate/20 bg-aina-navy-deep/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          className={cn(
            "cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-aina-teal/20 text-aina-teal" : "text-aina-slate hover:text-aina-frost",
          )}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-aina-slate/20 py-16 text-center">
      <span className="text-2xl opacity-70">◎</span>
      <p className="text-sm font-medium text-aina-slate">{title}</p>
      {hint && <p className="max-w-sm text-xs text-aina-slate/60">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-aina-frost">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-aina-slate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}