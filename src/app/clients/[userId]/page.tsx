"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { CinematicShell } from "../../../components/CinematicShell";
import { useSupabaseAuth } from "../../../hooks/useSupabaseAuth";
import { createSupabaseBrowserClient } from "../../../lib/supabaseClient";
import { Timeline } from "../../../components/Timeline";
import { MoodHeatmap } from "../../../components/MoodHeatmap";
import { GuidanceTasksSection } from "../../../components/GuidanceTasksSection";
import { CoachNotesPanel } from "../../../components/CoachNotesPanel";

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

async function fetchCoachId() {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return coach?.id ?? null;
}

export default function ClientProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const { data } = useSWR(["client-profile", userId], () => fetchClientProfile(userId));
  const { data: coachId } = useSWR("coach-id", fetchCoachId);

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

          <section>
            <CoachNotesPanel userId={userId} />
          </section>

          {goal && (
            <section className="rounded-3xl border-l-4 border-emerald-500/80 border border-slate-800/80 bg-gradient-to-br from-emerald-950/40 via-slate-950/80 to-slate-950/80 p-5 shadow-xl shadow-emerald-500/10">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-300/90">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-[0.26em] text-emerald-300/90 font-semibold">
                    Primary goal
                  </p>
                </div>
              </div>
              <h2 className="mt-3 text-lg font-semibold text-slate-50">
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
                <div className="mt-3 rounded-2xl border-l-2 border-rose-500/50 bg-rose-950/30 p-3 text-xs text-slate-200/90">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-300/90">
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
            <div className="space-y-3 rounded-3xl border-l-4 border-cyan-500/80 border border-slate-800/80 bg-gradient-to-br from-cyan-950/40 via-slate-950/80 to-slate-950/80 p-4 shadow-xl shadow-cyan-500/10">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0 w-5 h-5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-cyan-300/90">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  </div>
                  <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/90 font-semibold">
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

            <div className="space-y-3 rounded-3xl border-l-4 border-amber-500/80 border border-slate-800/80 bg-gradient-to-br from-amber-950/40 via-slate-950/80 to-slate-950/80 p-4 shadow-xl shadow-amber-500/10">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-5 h-5 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-300/90">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </div>
                <p className="text-xs uppercase tracking-[0.26em] text-amber-300/90 font-semibold">
                  Mood & energy
                </p>
              </div>
              <MoodHeatmap entries={data.moodEntries ?? []} />
            </div>
          </section>

          {coachId && (
            <section>
              <GuidanceTasksSection userId={userId} coachId={coachId} />
            </section>
          )}
        </div>
      )}
    </CinematicShell>
  );
}
