import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../lib/utils";

/* ---- Observatory UI Kit — quiet, editorial, restrained ---- */

export function Button({
  variant = "ghost",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "outline" | "ghost" | "danger" | "amber" | "subtle";
  size?: "xs" | "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 font-medium tracking-wide transition-colors duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 select-none",
        size === "xs" && "h-7 px-2.5 text-[11px] rounded-md",
        size === "sm" && "h-9 px-3.5 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-11 px-6 text-sm",

        variant === "solid" &&
          "bg-[#c2a878] text-[#241f14] font-semibold hover:bg-[#d8c294]",
        variant === "subtle" &&
          "bg-[#c2a878]/12 text-[#d8c294] border border-[#c2a878]/30 hover:bg-[#c2a878]/20",
        variant === "outline" &&
          "border border-obs-line-strong bg-obs-2/40 text-obs-fg hover:border-obs-fg-faint hover:bg-obs-3",
        variant === "ghost" &&
          "text-obs-fg-dim hover:bg-obs-3 hover:text-obs-fg",
        variant === "danger" &&
          "bg-obs-alert/10 text-obs-alert border border-obs-alert/25 hover:bg-obs-alert/20",
        variant === "amber" &&
          "bg-obs-warn/12 text-obs-warn border border-obs-warn/25 hover:bg-obs-warn/20",

        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone = "slate",
  dot = false,
  className,
  children,
}: {
  tone?: "slate" | "accent" | "warn" | "alert" | "ok" | "neutral";
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const tones: Record<string, { bg: string; dot: string }> = {
    slate: {
      bg: "bg-obs-3/80 text-obs-fg-dim border border-obs-line",
      dot: "bg-obs-fg-faint",
    },
    neutral: {
      bg: "bg-obs-2 text-obs-fg border border-obs-line-strong",
      dot: "bg-obs-fg-dim",
    },
    accent: {
      bg: "bg-obs-accent/12 text-obs-accent-strong border border-obs-accent/25",
      dot: "bg-obs-accent",
    },
    ok: {
      bg: "bg-obs-ok/12 text-obs-ok border border-obs-ok/25",
      dot: "bg-obs-ok",
    },
    warn: {
      bg: "bg-obs-warn/12 text-obs-warn border border-obs-warn/25",
      dot: "bg-obs-warn",
    },
    alert: {
      bg: "bg-obs-alert/12 text-obs-alert border border-obs-alert/25",
      dot: "bg-obs-alert",
    },
  };

  const selected = tones[tone] || tones.slate;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        selected.bg,
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", selected.dot)} />}
      {children}
    </span>
  );
}

export function Card({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={cn(
        "rounded-lg border border-obs-line bg-obs-2 transition-colors duration-150",
        onClick && "cursor-pointer hover:border-obs-line-strong hover:bg-obs-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-obs-line-strong bg-obs-1 px-3.5 text-sm text-obs-fg placeholder:text-obs-fg-faint outline-none transition-colors duration-150 focus:border-obs-accent/60 focus:bg-obs-1",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 cursor-pointer rounded-md border border-obs-line-strong bg-obs-1 px-3 text-sm font-medium text-obs-fg outline-none transition-colors duration-150 focus:border-obs-accent/60",
        className,
      )}
      {...props}
    >
      {children}
    </select>
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
        "relative h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-obs-accent/50",
        checked
          ? "border-obs-accent/50 bg-obs-accent/70"
          : "border-obs-line-strong bg-obs-4",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 block h-3.5 w-3.5 rounded-full transition-transform duration-200",
          checked ? "left-5 bg-obs-0" : "left-0.5 bg-obs-fg-dim",
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
  options: { value: T; label: string; icon?: React.ComponentType<{ className?: string }> }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-obs-line bg-obs-1 p-0.5">
      {options.map((o) => {
        const Icon = o.icon;
        const isActive = value === o.value;
        return (
          <button
            key={o.value}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors duration-150 select-none",
              isActive
                ? "bg-obs-3 text-obs-fg shadow-sm"
                : "text-obs-fg-dim hover:text-obs-fg",
            )}
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-obs-line-strong bg-obs-1/40 py-16 px-4 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-obs-line bg-obs-3 text-obs-fg-dim">
        <span className="font-display text-lg italic">∅</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-obs-fg">{title}</p>
        {hint && <p className="mt-1 max-w-sm text-xs text-obs-fg-dim leading-relaxed">{hint}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-obs-line pb-5">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[26px] leading-tight font-medium tracking-tight text-obs-fg">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-obs-fg-dim">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({
  title,
  value,
  unit,
  subtitle,
  trend,
  tone = "accent",
  icon,
}: {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  trend?: string;
  tone?: "accent" | "warn" | "alert" | "ok";
  icon?: ReactNode;
}) {
  const toneClasses = {
    accent: "text-obs-accent-strong",
    ok: "text-obs-ok",
    warn: "text-obs-warn",
    alert: "text-obs-alert",
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-obs-fg-dim">
          {title}
        </span>
        {icon && <div className="text-obs-fg-faint">{icon}</div>}
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className={cn("font-mono text-2xl font-medium tracking-tight", toneClasses[tone])}>
          {value}
        </span>
        {unit && <span className="text-xs text-obs-fg-dim">{unit}</span>}
        {trend && (
          <span className="ml-auto font-mono text-[10px] text-obs-fg-dim bg-obs-3 px-1.5 py-0.5 rounded">
            {trend}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-[11px] text-obs-fg-dim truncate">{subtitle}</p>}
    </Card>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 obs-rise">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-xl border border-obs-line-strong bg-obs-2 shadow-2xl shadow-black/50">
        {title && (
          <div className="flex items-center justify-between border-b border-obs-line px-5 py-3.5">
            <h3 className="font-display text-base font-medium text-obs-fg">{title}</h3>
            <button
              onClick={onClose}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-obs-fg-dim hover:bg-obs-3 hover:text-obs-fg transition-colors"
            >
              ✕
            </button>
          </div>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
}
