"use client";

import * as React from "react";

import { cx } from "./primitives";

type ToastTone = "info" | "success" | "danger";

type Toast = {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
};

type ToastInput = { title: string; message?: string; tone?: ToastTone };

const ToastContext = React.createContext<{
  push: (toast: ToastInput) => void;
} | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (input: ToastInput) => {
      const toast: Toast = { id: nextId++, tone: "info", ...input };
      setToasts((current) => [...current.slice(-2), toast]);
      setTimeout(() => dismiss(toast.id), 4200);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-100 flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
        role="region"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <button
            key={toast.id}
            onClick={() => dismiss(toast.id)}
            className={cx(
              "pointer-events-auto w-full max-w-sm animate-rise rounded-xl border px-4 py-3 text-left backdrop-blur-md",
              toast.tone === "success" && "border-success/45 bg-success/12",
              toast.tone === "danger" && "border-danger/45 bg-danger/12",
              toast.tone === "info" && "border-hairline bg-surface/90",
            )}
          >
            <p className="font-display text-xs font-bold tracking-wide">{toast.title}</p>
            {toast.message ? (
              <p className="mt-0.5 text-xs text-ink-muted">{toast.message}</p>
            ) : null}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
