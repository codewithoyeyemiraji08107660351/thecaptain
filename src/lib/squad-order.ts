import { supabase } from "@/integrations/supabase/client";

export type SortMode = "date_joined" | "alphabetical" | "most_active" | "pending_actions" | "custom";

export interface SquadPreferences {
  sort_mode: SortMode;
  sort_desc: boolean;
  custom_order: string[];
}

export const DEFAULT_PREFS: SquadPreferences = {
  sort_mode: "date_joined",
  sort_desc: false,
  custom_order: [],
};

export async function getUserSquadPreferences(userId: string): Promise<SquadPreferences> {
  const { data } = await (supabase as any)
    .from("user_squad_preferences")
    .select("id, sort_mode, sort_desc, custom_order, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  const record = Array.isArray(data) ? data[0] : data;
  if (!record) return DEFAULT_PREFS;

  return {
    sort_mode: record.sort_mode as SortMode,
    sort_desc: record.sort_desc,
    custom_order: Array.isArray(record.custom_order) ? record.custom_order : [],
  };
}

export async function setUserSquadPreferences(
  userId: string,
  prefs: Partial<SquadPreferences>
): Promise<void> {
  const { data: existingRows } = await (supabase as any)
    .from("user_squad_preferences")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  const payload = {
    user_id: userId,
    ...prefs,
    updated_at: new Date().toISOString(),
  };

  const existingId = Array.isArray(existingRows) ? existingRows[0]?.id : existingRows?.id;

  if (existingId) {
    await (supabase as any)
      .from("user_squad_preferences")
      .update(payload)
      .eq("id", existingId);
    return;
  }

  await (supabase as any)
    .from("user_squad_preferences")
    .insert(payload);
}

export interface SortableSquad {
  id: string;
  name: string;
  created_at?: string;
  joined_at?: string;
  memberCount?: number;
  activeCommandCount?: number;
  activityScore?: number;
  pendingActionCount?: number;
}

export function orderSquads<T extends SortableSquad>(
  squads: T[],
  prefs: SquadPreferences
): T[] {
  const sorted = [...squads];

  switch (prefs.sort_mode) {
    case "alphabetical":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "most_active":
      sorted.sort((a, b) =>
        (b.activityScore || 0) - (a.activityScore || 0) ||
        (b.pendingActionCount || 0) - (a.pendingActionCount || 0) ||
        (b.memberCount || 0) - (a.memberCount || 0)
      );
      break;
    case "pending_actions":
      sorted.sort((a, b) =>
        (b.pendingActionCount || 0) - (a.pendingActionCount || 0) ||
        (b.activityScore || 0) - (a.activityScore || 0)
      );
      break;
    case "custom": {
      const orderMap = new Map(prefs.custom_order.map((id, i) => [id, i]));
      sorted.sort((a, b) => {
        const ai = orderMap.get(a.id) ?? 999;
        const bi = orderMap.get(b.id) ?? 999;
        return ai - bi;
      });
      return sorted;
    }
    case "date_joined":
    default:
      sorted.sort((a, b) =>
        new Date(a.joined_at || a.created_at || 0).getTime() -
        new Date(b.joined_at || b.created_at || 0).getTime()
      );
      break;
  }

  if (prefs.sort_desc) sorted.reverse();
  return sorted;
}
