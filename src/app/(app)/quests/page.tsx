import type { Metadata } from "next";

import { CustomQuests } from "@/components/game/custom-quests";
import { QuestList } from "@/components/game/quest-list";
import { SystemNotice } from "@/components/game/system-notice";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/server";
import { ensureTodayQuests, requireProfile } from "@/lib/data";
import type { CustomQuest } from "@/lib/types/database";

export const metadata: Metadata = { title: "Quests" };

export default async function QuestsPage() {
  const profile = await requireProfile();
  const { quests, date } = await ensureTodayQuests(profile);

  const supabase = await createClient();
  const { data: custom } = await supabase
    .from("custom_quests")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  const core = quests.filter((q) => !q.is_bonus);
  const done = core.filter((q) => q.completed).length;
  const bonus = quests.find((q) => q.is_bonus);

  return (
    <div className="space-y-4">
      <SystemNotice
        quests={core}
        completed={done}
        bonusXp={Number(bonus?.reward?.player ?? 0)}
        date={date}
      />

      <Panel>
        <PanelHeader
          eyebrow={`${done} of ${core.length} complete`}
          title="Objectives"
        />
        <QuestList quests={quests} />
      </Panel>

      <CustomQuests initial={(custom as CustomQuest[]) ?? []} />
    </div>
  );
}
