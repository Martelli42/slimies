"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Icon } from "@/components/icon";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  PanelHeader,
  Select,
  cx,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ACTIVITY_TYPES } from "@/lib/activities";
import { createClient } from "@/lib/supabase/client";
import type { CustomQuest } from "@/lib/types/database";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Player-authored recurring quests.
 *
 * These write straight to the table under Row Level Security — safe because the
 * XP reward is recomputed by a database trigger, so nothing the client sends
 * can inflate it.
 */
export function CustomQuests({ initial }: { initial: CustomQuest[] }) {
  const router = useRouter();
  const toast = useToast();

  const [quests, setQuests] = React.useState(initial);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<CustomQuest | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [minutes, setMinutes] = React.useState(20);
  const [activityType, setActivityType] = React.useState("");
  const [cadence, setCadence] = React.useState<CustomQuest["cadence"]>("daily");
  const [days, setDays] = React.useState<number[]>([1, 3, 5]);

  // Re-sync when the server sends a fresh list (after router.refresh()).
  const [lastInitial, setLastInitial] = React.useState(initial);
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setQuests(initial);
  }

  async function create() {
    if (title.trim().length < 2) {
      toast.push({ title: "Give it a name", tone: "danger" });
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("custom_quests")
      .insert({
        title: title.trim(),
        target_minutes: minutes,
        activity_type: activityType || null,
        cadence,
        days_of_week: cadence === "specific_days" ? days : [],
      })
      .select()
      .single();

    setBusy(false);

    if (error) {
      toast.push({ title: "Could not save that", message: error.message, tone: "danger" });
      return;
    }

    setQuests((current) => [data as CustomQuest, ...current]);
    setCreating(false);
    setTitle("");
    toast.push({
      title: "Quest added",
      message: "It appears on your board from the next reset.",
      tone: "success",
    });
    router.refresh();
  }

  async function remove(quest: CustomQuest) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("custom_quests").delete().eq("id", quest.id);
    setBusy(false);
    setDeleting(null);

    if (error) {
      toast.push({ title: "Could not remove it", message: error.message, tone: "danger" });
      return;
    }

    setQuests((current) => current.filter((q) => q.id !== quest.id));
    router.refresh();
  }

  return (
    <Panel>
      <PanelHeader
        eyebrow="Yours"
        title="Custom quests"
        action={
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> New
          </Button>
        }
      />

      {quests.length === 0 ? (
        <EmptyState
          title="No custom quests yet"
          message="Add the habits you want the system to hold you to — gym, reading, Spanish, whatever."
          icon={<Icon name="scroll" size={24} />}
        />
      ) : (
        <ul className="space-y-2">
          {quests.map((quest) => (
            <li
              key={quest.id}
              className="flex items-center gap-3 rounded-xl border border-hairline bg-abyss/40 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{quest.title}</p>
                <p className="text-[0.68rem] text-ink-faint">
                  {cadenceLabel(quest)} · {quest.target_minutes} min · +{quest.xp_reward} XP
                </p>
              </div>
              <button
                onClick={() => setDeleting(quest)}
                aria-label={`Remove ${quest.title}`}
                className="text-ink-faint transition-colors hover:text-danger"
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New custom quest"
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button fullWidth onClick={create} loading={busy}>
              Add quest
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" htmlFor="quest-title">
            <Input
              id="quest-title"
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Read 20 pages"
            />
          </Field>

          <Field label="Target minutes" htmlFor="quest-minutes">
            <Input
              id="quest-minutes"
              type="number"
              min={5}
              max={240}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </Field>

          <Field
            label="Counts toward"
            htmlFor="quest-type"
            hint="Leave open and any activity progresses it."
          >
            <Select
              id="quest-type"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
            >
              <option value="">Any activity</option>
              {ACTIVITY_TYPES.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Repeats" htmlFor="quest-cadence">
            <Select
              id="quest-cadence"
              value={cadence}
              onChange={(e) => setCadence(e.target.value as CustomQuest["cadence"])}
            >
              <option value="daily">Every day</option>
              <option value="specific_days">Specific days</option>
              <option value="weekly">Once a week (Mondays)</option>
              <option value="once">One time</option>
            </Select>
          </Field>

          {cadence === "specific_days" ? (
            <div className="flex gap-1.5">
              {DAYS.map((day, index) => {
                const active = days.includes(index);
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Day ${index + 1}`}
                    onClick={() =>
                      setDays((current) =>
                        current.includes(index)
                          ? current.filter((d) => d !== index)
                          : [...current, index],
                      )
                    }
                    className={cx(
                      "size-9 rounded-lg border font-display text-xs font-bold transition-colors",
                      active
                        ? "border-accent/60 bg-accent/15 text-accent-soft"
                        : "border-hairline text-ink-faint",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove(deleting)}
        title="Remove this quest?"
        message="It stops appearing on future boards. XP you already earned from it stays."
        confirmLabel="Remove"
        destructive
        loading={busy}
      />
    </Panel>
  );
}

function cadenceLabel(quest: CustomQuest): string {
  switch (quest.cadence) {
    case "daily":
      return "Every day";
    case "weekly":
      return "Weekly";
    case "once":
      return "One time";
    case "specific_days":
      return quest.days_of_week
        .slice()
        .sort()
        .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
        .join(", ");
    default:
      return "";
  }
}
