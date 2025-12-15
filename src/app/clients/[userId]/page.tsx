"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { CinematicShell } from "../../../components/CinematicShell";
import { useSupabaseAuth } from "../../../hooks/useSupabaseAuth";
import { createSupabaseBrowserClient } from "../../../lib/supabaseClient";
import { Timeline } from "../../../components/Timeline";
import { MoodHeatmap } from "../../../components/MoodHeatmap";

async function fetchClientProfile(userId: string) {
  const supabase = createSupabaseBrowserClient();

  const [userRes, goalsRes, microtasksRes, feedbackRes, moodRes] =
    await Promise.all([
      supabase.from("users").select("id,full_name,email").eq("id", userId).maybeSingle(),
      supabase.from("goals").select("*").eq("user_id", userId),
      supabase
        .from("microtasks")
        .select("*,created_at,updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("feedback")
        .select("outcome,feedback_text,created_at")
        .eq("user_id", userId),
      supabase
        .from("mood_entries")
        .select("date,mood,sleep_hours,exercise_minutes")
        .eq("user_id", userId),
    ]);

  return {
    user: userRes.data,
    goals: goalsRes.data ?? [],
    microtasks: microtasksRes.data ?? [],
    feedback: feedbackRes.data ?? [],
    moodEntries: moodRes.data ?? [],
  };
}

export default function ClientProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const { data } = useSWR(["client-profile", userId], () => fetchClientProfile(userId));

  if (!loading && !user) {
    router.replace("/login");
  }

  const goal = data?.goals?.[0];

  return (
    <CinematicShell>
      {!data ? (
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6 text-sm text-slate-100 shadow-xl shadow-amber-500/10">
          Loading client...
        </div>
      ) : (
        <div className="space-y-5">
          <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
                Client profile
              </p>
              <h1 className="text-xl font-semibold text-slate-50">
                {data.user?.full_name ?? "Client"}
              </h1>
              <p className="text-sm text-slate-300/90">
                Goals, microtasks, moods—everything you need to coach this client
                in one cinematic view.
              </p>
            </div>
          </section>

          {goal && (
            <section className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/50">
              <p className="text-xs uppercase tracking-[0.26em] text-amber-300/90">
                Primary goal
              </p>
              <h2 className="mt-2 text-lg font-semibold text-slate-50">
                {goal.goal_text}
              </h2>
              <p className="mt-1 text-xs text-slate-300/90">
                Status: {goal.status}
              </p>
              {goal.progress_summary && (
                <p className="mt-2 text-sm text-slate-200/90">
                  {goal.progress_summary}
                </p>
              )}
              {goal.stuck_task && (
                <div className="mt-3 rounded-2xl bg-slate-900/80 p-3 text-xs text-slate-200/90">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300/90">
                    Stuck task
                  </p>
                  <p className="mt-1">{goal.stuck_task}</p>
                  {goal.stuck_task_step && (
                    <p className="mt-1 text-slate-300/90">
                      Ladder step: {goal.stuck_task_step}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)]">
            <div className="space-y-3 rounded-3xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-xl shadow-black/50">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-amber-300/90">
                    Microtask timeline
                  </p>
                </div>
              </div>
              <Timeline
                items={(data.microtasks ?? []).map((t: any) => ({
                  id: t.id,
                  title: t.user_edited_task || t.task_text,
                  subtitle: t.explanation ?? undefined,
                  meta: new Date(t.created_at).toLocaleString(),
                  status: t.status,
                }))}
              />
            </div>

            <div className="space-y-3 rounded-3xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-xl shadow-black/50">
              <p className="text-xs uppercase tracking-[0.26em] text-amber-300/90">
                Mood & energy
              </p>
              <MoodHeatmap entries={data.moodEntries ?? []} />
            </div>
          </section>
        </div>
      )}
    </CinematicShell>
  );
}
