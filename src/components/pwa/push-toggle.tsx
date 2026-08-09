"use client";

import * as React from "react";

import { Icon } from "@/components/icon";
import { Alert, Button, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type State = "unsupported" | "unconfigured" | "denied" | "off" | "on";

/**
 * Web Push opt-in.
 *
 * Handles every branch a browser can be in: no service worker, no VAPID key
 * configured on the deployment, permission previously denied, or simply not
 * subscribed yet.
 */
export function PushToggle() {
  const toast = useToast();
  const [state, setState] = React.useState<State>("off");
  const [busy, setBusy] = React.useState(false);
  const [publicKey, setPublicKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function probe() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }

      const response = await fetch("/api/push/public-key").catch(() => null);
      const body = await response?.json().catch(() => null);
      if (cancelled) return;

      if (!body?.key) {
        setState("unconfigured");
        return;
      }
      setPublicKey(body.key);

      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) setState(subscription ? "on" : "off");
    }

    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) throw new Error("subscribe failed");

      setState("on");
      toast.push({ title: "Notifications enabled", tone: "success" });
    } catch {
      toast.push({
        title: "Could not enable notifications",
        message: "Your browser or platform refused the subscription.",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setState("off");
      toast.push({ title: "Notifications disabled", tone: "info" });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    const response = await fetch("/api/push/test", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    toast.push({
      title: response.ok ? "Test sent" : "Test failed",
      message: response.ok ? "It should arrive in a second." : body.error,
      tone: response.ok ? "success" : "danger",
    });
  }

  if (state === "unsupported") {
    return (
      <Alert tone="info">
        This browser does not support push notifications. On iOS, install the app to your
        home screen first — Safari only allows push for installed web apps.
      </Alert>
    );
  }

  if (state === "unconfigured") {
    return (
      <Alert tone="info">
        Push is not configured on this deployment. Add a VAPID key pair to enable it — the
        README has the two commands.
      </Alert>
    );
  }

  if (state === "denied") {
    return (
      <Alert tone="warning">
        Notifications are blocked for this site. Re-enable them in your browser&apos;s site
        settings, then come back.
      </Alert>
    );
  }

  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-xl border p-3.5",
        state === "on" ? "border-accent/40 bg-accent/8" : "border-hairline bg-abyss/40",
      )}
    >
      <span
        className={cx(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border",
          state === "on"
            ? "border-accent/40 bg-accent/12 text-accent-soft"
            : "border-hairline text-ink-faint",
        )}
      >
        <Icon name="bell" size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Push notifications</p>
        <p className="text-[0.68rem] text-ink-faint">
          {state === "on" ? "Enabled on this device" : "Off on this device"}
        </p>
      </div>

      {state === "on" ? (
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={sendTest} disabled={busy}>
            Test
          </Button>
          <Button size="sm" variant="secondary" onClick={disable} loading={busy}>
            Off
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={enable} loading={busy}>
          Enable
        </Button>
      )}
    </div>
  );
}

/** VAPID keys arrive base64url-encoded; the Push API wants raw bytes. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
