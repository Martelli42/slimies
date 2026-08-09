"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Alert, Button, Field, Input, Panel } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export function AddFriendForm() {
  const router = useRouter();
  const toast = useToast();

  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(body.error ?? "Could not send that request.");
      return;
    }

    setCode("");
    toast.push({
      title: body.status === "accepted" ? "You are now allies" : "Request sent",
      message:
        body.status === "accepted"
          ? "They had already invited you."
          : `Waiting on ${body.target?.display_name ?? "them"} to accept.`,
      tone: "success",
    });
    router.push("/friends");
    router.refresh();
  }

  return (
    <Panel>
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}

        <Field
          label="Friend code or username"
          htmlFor="code"
          hint="Codes look like NOVA-7F92."
        >
          <Input
            id="code"
            value={code}
            maxLength={24}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
            placeholder="NOVA-7F92"
          />
        </Field>

        <Button type="submit" fullWidth loading={loading} disabled={code.trim().length < 3}>
          Send request
        </Button>
      </form>
    </Panel>
  );
}
