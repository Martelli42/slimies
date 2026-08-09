import * as React from "react";

/** Tiny class joiner — avoids pulling in a dependency for three lines. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Panel */

export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("panel p-4", className)} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        {eyebrow ? <p className="label-eyebrow mb-1">{eyebrow}</p> : null}
        <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-linear-to-b from-accent to-accent-deep text-white shadow-[0_8px_28px_-10px_var(--color-accent)] hover:brightness-110 border border-accent-soft/30",
  secondary:
    "bg-surface-2 text-ink border border-hairline hover:border-accent/50 hover:bg-surface-2/80",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-2/60 border border-transparent",
  danger: "bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  fullWidth?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const sizes = {
    sm: "h-9 px-3 text-xs",
    md: "h-11 px-4 text-sm",
    lg: "h-13 px-6 text-base",
  } as const;

  return (
    <button
      className={cx(
        "relative inline-flex items-center justify-center gap-2 rounded-xl font-display font-bold uppercase tracking-[0.12em] transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        BUTTON_STYLES[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ Input */

export type FieldProps = {
  label?: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  htmlFor?: string;
};

export function Field({ label, hint, error, children, htmlFor }: FieldProps) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={htmlFor} className="label-eyebrow block">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-xl border border-hairline bg-abyss/80 px-3.5 py-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(CONTROL, className)} {...props} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={cx(CONTROL, "min-h-24 resize-y", className)} {...props} />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cx(CONTROL, "appearance-none pr-9", className)} {...props}>
      {children}
    </select>
  );
});

/* ------------------------------------------------------------------ Badge */

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "danger" | "warning";
  className?: string;
}) {
  const tones = {
    neutral: "border-hairline bg-surface-2 text-ink-muted",
    accent: "border-accent/40 bg-accent/12 text-accent-soft",
    success: "border-success/40 bg-success/12 text-success",
    danger: "border-danger/40 bg-danger/12 text-danger",
    warning: "border-warning/40 bg-warning/12 text-warning",
  } as const;

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-display text-[0.62rem] font-bold uppercase tracking-[0.14em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        "relative overflow-hidden rounded-lg bg-surface-2",
        "after:absolute after:inset-0 after:animate-sweep after:bg-linear-to-r after:from-transparent after:via-white/6 after:to-transparent",
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------- EmptyState */

export function EmptyState({
  title,
  message,
  action,
  icon,
}: {
  title: string;
  message?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      {icon ? <div className="text-ink-faint">{icon}</div> : null}
      <p className="font-display text-sm font-bold tracking-wide">{title}</p>
      {message ? <p className="max-w-xs text-xs text-ink-muted">{message}</p> : null}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ Alert */

export function Alert({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "warning" | "info";
  children: React.ReactNode;
}) {
  const tones = {
    danger: "border-danger/40 bg-danger/10 text-danger",
    warning: "border-warning/40 bg-warning/10 text-warning",
    info: "border-accent/40 bg-accent/10 text-accent-soft",
  } as const;

  return (
    <div
      role="alert"
      className={cx("rounded-xl border px-3.5 py-3 text-xs leading-relaxed", tones[tone])}
    >
      {children}
    </div>
  );
}
