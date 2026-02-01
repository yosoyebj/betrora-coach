import { createSupabaseBrowserClient } from "./supabaseClient";
import type { CoachTask } from "./types";

export type PendingFeedbackTask = CoachTask & {
  user: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

type UserRow = {
  id: string;
};

export async function fetchPendingFeedbackTasks(
  coachId: string
): Promise<PendingFeedbackTask[]> {
  const supabase = createSupabaseBrowserClient();

  // Fetch tasks that are completed and need feedback
  const { data: tasksData, error: tasksError } = await supabase
    .from("coach_tasks")
    .select("*")
    .eq("coach_id", coachId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  if (tasksError) {
    console.error("Error fetching pending feedback tasks:", tasksError);
    return [];
  }

  if (!tasksData || tasksData.length === 0) {
    return [];
  }

  const taskRows = (tasksData ?? []) as CoachTask[];

  // Filter for tasks that need feedback (null or empty string)
  const tasksNeedingFeedback = taskRows.filter(
    (task) => !task.coach_feedback || task.coach_feedback.trim() === ""
  );

  if (tasksNeedingFeedback.length === 0) {
    return [];
  }

  // Now fetch user data for each task
  const userIds = [...new Set(taskRows.map((t) => t.user_id))];
  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("id, full_name, email")
    .in("id", userIds);

  if (usersError) {
    console.error("Error fetching users:", usersError);
    // Return tasks without user data
    return taskRows.map((task) => ({
      ...task,
      user: null,
    })) as PendingFeedbackTask[];
  }

  const users = (usersData ?? []) as UserRow[];
  const usersMap = new Map(users.map((u) => [u.id, u]));

  return tasksNeedingFeedback.map((task) => ({
    ...task,
    user: usersMap.get(task.user_id) || null,
  })) as PendingFeedbackTask[];
}
