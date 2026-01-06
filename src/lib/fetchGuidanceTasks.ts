import { createSupabaseBrowserClient } from "./supabaseClient";
import type { CoachTask } from "./types";

export async function fetchClientGuidanceTasks(
  userId: string,
  coachId: string
): Promise<CoachTask[]> {
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("coach_tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching guidance tasks:", error);
    return [];
  }

  return (data || []) as CoachTask[];
}
