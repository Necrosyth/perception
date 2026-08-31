import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../lib/utils";

// ---- Ultra-Premium Surveillance UI Kit (Hypotenuse Enterprise Design) ----

export function Button({
  variant = "ghost",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "outline" | "ghost" | "danger" | "amber" | "glow" | "cyber";
  size?: "xs" | "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium tracking-wide transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 select-none",
        size === "xs" && "h-6 px-2 text-[11px] rounded-md",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-9 px-4 text-xs font-semibold",
        size === "lg" && "h-11 px-5 text-sm font-semibold",
        
        variant === "solid" &&
          "bg-gradient-to-r from-[#2fbfa4] to-[#25a38b] text-[#060b13] font-semibold shadow-md shadow-[#2fbfa4]/20 hover:from-[#35d8b9] hover:to-[#2fbfa4] hover:shadow-[#2fbfa4]/30 border border-[#48e2c5]/40",
        
        variant === "glow" &&
          "bg-[#2fbfa4]/15 text-[#38efcb] border border-[#2fbfa4]/40 hover:bg-[#2fbfa4]/25 hover:border-[#2fbfa4]/70 shadow-[0_0_15px_rgba(47,191,164,0.2)]",
        
        variant === "outline" &&
          "border border-slate-700/60 bg-[#0c1829]/60 text-[#e2edf8] hover:border-[#2fbfa4]/50 hover:bg-[#0f2139] hover:text-[#38efcb]",
        
        variant === "ghost" &&
          "text-[#8fa0b5] hover:bg-[#0e1b2f] hover:text-[#f0f6fc]",
        
        variant === "danger" &&
          "bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 hover:border-red-500/45 hover:text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.15)]",
        
        variant === "amber" &&
          "bg-amber-500/10 text-amber-300 border border-amber-500/25 hover:bg-amber-500/20 hover:border-amber-500/45 hover:text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.15)]",
        
        variant === "cyber" &&
          "bg-[#091524] text-[#00e5ff] border border-[#00e5ff]/30 hover:border-[#00e5ff]/60 hover:bg-[#00e5ff]/10 hover:shadow-[0_0_18px_rgba(0,229,255,0.2)]",
        
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
  tone?: "slate" | "teal" | "amber" | "red" | "navy" | "cyan" | "purple" | "emerald";
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const tones: Record<string, { bg: string; dot: string }> = {
    slate: {
      bg: "bg-slate-800/80 text-slate-300 border border-slate-700/60",
      dot: "bg-slate-400",
    },
    teal: {
      bg: "bg-[#2fbfa4]/15 text-[#35d8b9] border border-[#2fbfa4]/30 shadow-[0_0_8px_rgba(47,191,164,0.15)]",
      dot: "bg-[#2fbfa4]",
    },
    cyan: {
      bg: "bg-[#00e5ff]/15 text-[#38efff] border border-[#00e5ff]/30 shadow-[0_0_8px_rgba(0,229,255,0.15)]",
      dot: "bg-[#00e5ff]",
    },
    amber: {
      bg: "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.15)]",
      dot: "bg-amber-400",
    },
    red: {
      bg: "bg-red-500/15 text-red-400 border border-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.15)]",
      dot: "bg-red-400",
    },
    emerald: {
      bg: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
      dot: "bg-emerald-400",
    },
    purple: {
      bg: "bg-purple-500/15 text-purple-300 border border-purple-500/30",
      dot: "bg-purple-400",
    },
    navy: {
      bg: "bg-[#0c1829] text-[#e2edf8] border border-slate-700/50",
      dot: "bg-slate-300",
    },
  };

  const selected = tones[tone] || tones.slate;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        selected.bg,
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", selected.dot)} />
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", selected.dot)} />
        </span>
      )}
      {children}
    </span>
  );
}

export function Card({
  className,
  glow = false,
  children,
  onClick,
}: {
  className?: string;
  glow?: boolean;
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
        "relative rounded-xl border border-slate-800/80 bg-gradient-to-b from-[#0e1c2e]/90 to-[#081220]/95 backdrop-blur-md shadow-lg shadow-black/40 transition-all duration-200",
        glow && "border-[#2fbfa4]/35 shadow-[0_0_25px_-5px_rgba(47,191,164,0.18)]",
        onClick && "cursor-pointer hover:border-slate-700 hover:from-[#11233a]/95 hover:to-[#0a1526]/95 hover:shadow-xl",
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
        "h-9 w-full rounded-lg border border-slate-700/60 bg-[#081220]/80 px-3.5 text-xs text-[#f0f6fc] placeholder:text-slate-500 outline-none transition-all duration-150 focus:border-[#2fbfa4]/70 focus:bg-[#0b1728] focus:ring-2 focus:ring-[#2fbfa4]/20",
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
        "h-9 cursor-pointer rounded-lg border border-slate-700/60 bg-[#081220]/90 px-3 text-xs font-medium text-[#e2edf8] outline-none transition-all duration-150 focus:border-[#2fbfa4]/70 focus:bg-[#0b1728] focus:ring-2 focus:ring-[#2fbfa4]/20",
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
        "relative h-5 w-9 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-[#2fbfa4]/50",
        checked
          ? "bg-[#2fbfa4] shadow-[0_0_10px_rgba(47,191,164,0.4)]"
          : "bg-slate-800 border border-slate-700/60",
      )}
    >
      <span
        className={cn(
          "block h-4 w-4 rounded-full bg-[#f0f6fc] shadow-md transition-transform duration-200 ease-in-out",
          checked ? "translate-x-4 bg-[#060b13]" : "translate-x-0",
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
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-800 bg-[#07111e]/90 p-1 shadow-inner">
      {options.map((o) => {
        const Icon = o.icon;
        const isActive = value === o.value;
        return (
          <button
            key={o.value}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all duration-150 select-none",
              isActive
                ? "bg-gradient-to-r from-[#2fbfa4]/20 to-[#2fbfa4]/10 text-[#38efcb] border border-[#2fbfa4]/40 font-semibold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent",
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-800/90 bg-[#091322]/40 py-16 px-4 text-center backdrop-blur-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-700/50 bg-[#0f1d30] text-[#2fbfa4] shadow-[0_0_20px_rgba(47,191,164,0.1)]">
        <span className="text-xl">◎</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-[#f0f6fc]">{title}</p>
        {hint && <p className="mt-1 max-w-sm text-xs text-slate-400 leading-relaxed">{hint}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/60 pb-4">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-[#f0f6fc] font-display">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-1 text-xs font-normal text-[#8fa0b5] tracking-wide font-sans">
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
  tone = "teal",
  icon,
}: {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  trend?: string;
  tone?: "teal" | "amber" | "red" | "cyan";
  icon?: ReactNode;
}) {
  const toneClasses = {
    teal: "text-[#2fbfa4] border-[#2fbfa4]/20",
    cyan: "text-[#00e5ff] border-[#00e5ff]/20",
    amber: "text-amber-400 border-amber-500/20",
    red: "text-red-400 border-red-500/20",
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </span>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cn("text-2xl font-bold font-mono tracking-tight", toneClasses[tone])}>
          {value}
        </span>
        {unit && <span className="text-xs text-slate-400 font-medium">{unit}</span>}
        {trend && (
          <span className="ml-auto text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
            {trend}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-[11px] text-slate-400 truncate">{subtitle}</p>}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-b from-[#0f1f33] to-[#07111e] shadow-2xl shadow-black/80">
        {title && (
          <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-[#f0f6fc] tracking-wide">{title}</h3>
            <button
              onClick={onClose}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
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