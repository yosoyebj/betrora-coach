"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { CinematicShell } from "../../components/CinematicShell";
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import { useCoachRole } from "../../hooks/useSupabaseAuth";
import { StatCard } from "../../components/StatCard";
import { ActiveClientsModal } from "../../components/ActiveClientsModal";
import { PendingFeedbackNotification } from "../../components/PendingFeedbackNotification";
import { PendingSessionApprovalNotification } from "../../components/PendingSessionApprovalNotification";
import useSWR from "swr";
import { createSupabaseBrowserClient } from "../../lib/supabaseClient";

async function fetchDashboardKpis() {
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
  if (!coach) return null;

  const coachId = coach.id;

  // First, get active subscriptions to get client user IDs
  const subscriptionsRes = await supabase
    .from("coach_subscriptions")
    .select("user_id")
    .eq("coach_id", coachId)
    .eq("status", "active");

  const uniqueClientIds = Array.from(new Set(
    (subscriptionsRes.data ?? []).map((s: any) => s.user_id)
  )) as string[];

  const activeClients = uniqueClientIds.length;

  let activeClientsList: any[] = [];
  if (uniqueClientIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", uniqueClientIds);
    activeClientsList = users ?? [];
  }

  // Now fetch data for these clients
  const [messagesRes, goalsRes, microtasksRes, moodRes] = await Promise.all([
    supabase
      .from("coach_messages")
      .select("user_id,status")
      .eq("coach_id", coachId),
    // Goals don't have coach_id, filter by user_id from active subscriptions
    uniqueClientIds.length > 0
      ? supabase
          .from("goals")
          .select("status,stuck_task")
          .in("user_id", uniqueClientIds)
      : { data: [], error: null },
    // Microtasks don't have coach_id, filter by user_id from active subscriptions
    uniqueClientIds.length > 0
      ? supabase
          .from("microtasks")
          .select("status,skip_count")
          .in("user_id", uniqueClientIds)
      : { data: [], error: null },
    // Mood entries don't have coach_id, filter by user_id from active subscriptions
    uniqueClientIds.length > 0
      ? supabase
          .from("mood_entries")
          .select("mood")
          .in("user_id", uniqueClientIds)
          .order("date", { ascending: false })
          .limit(14)
      : { data: [], error: null },
  ]);

  const pendingMessages = (messagesRes.data ?? []).filter(
    (m: any) => m.status === "pending",
  ).length;

  const goals = goalsRes.data ?? [];
  const goalsInProgress = goals.filter((g: any) => g.status === "active").length;
  const goalsCompleted = goals.filter((g: any) => g.status === "completed").length;
  const stuckCount = goals.filter((g: any) => g.stuck_task).length;

  const moodTrend = moodRes.data ?? [];

  return {
    activeClients,
    activeClientsList,
    pendingMessages,
    goalsInProgress,
    goalsCompleted,
    stuckCount,
    moodTrend,
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [showClientsModal, setShowClientsModal] = useState(false);
  const { user, loading } = useSupabaseAuth();
  const { coach, isCoach, loading: coachLoading } = useCoachRole();
  const { data } = useSWR("dashboard-kpis", fetchDashboardKpis);

  if (!loading && !user) {
    router.replace("/login");
  }

  return (
    <CinematicShell>
      {!coachLoading && !isCoach ? (
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6 text-sm text-slate-100 shadow-xl shadow-amber-500/10">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
            Coach access required
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-50">
            You&apos;re signed in, but not as a coach.
          </h1>
          <p className="mt-2 text-sm text-slate-300/90">
            This console is reserved for Betrora coaches. If you believe this is a
            mistake, reach out to the Betrora team or request access from your
            client app.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <PendingFeedbackNotification coachId={coach?.id ?? null} />
          <PendingSessionApprovalNotification coachId={coach?.id ?? null} />
          
          <section className="flex flex-col gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 shadow-2xl shadow-amber-500/20 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl space-y-2">
              <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
                Welcome back, coach
              </p>
              <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
                Your clients are waiting for your next nudge.
              </h1>
              <p className="text-sm text-slate-300/90">
                Track who needs attention, scan microtask momentum, and spot mood
                shifts—without losing the cinematic calm.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-4 sm:mt-0">
              <div className="h-16 w-16 rounded-3xl bg-[radial-gradient(circle_at_30%_0,_rgba(251,191,36,0.95),_transparent_60%),radial-gradient(circle_at_70%_100%,_rgba(52,211,153,0.9),_transparent_60%)] opacity-90 shadow-[0_0_40px_rgba(251,191,36,0.8)]" />
              <div className="text-xs text-slate-300/90">
                <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400/90">
                  Focus today
                </p>
                <p className="mt-1 font-medium text-amber-200/90">
                  Clear pending messages & check on stuck goals.
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active clients"
              value={data?.activeClients ?? "--"}
              trendLabel="Unique clients who messaged you"
              accent="cyan"
              onClick={() => setShowClientsModal(true)}
            />
            <StatCard
              label="Pending messages"
              value={data?.pendingMessages ?? "--"}
              trendLabel="Conversations waiting for your reply"
              accent="amber"
            />
            <StatCard
              label="Goals in progress"
              value={data?.goalsInProgress ?? "--"}
              trendLabel={`Completed: ${data?.goalsCompleted ?? 0}`}
              accent="emerald"
            />
            <StatCard
              label="Stuck tasks"
              value={data?.stuckCount ?? "--"}
              trendLabel="Clients signalling resistance"
              accent="rose"
            />
          </section>

          <ActiveClientsModal
            isOpen={showClientsModal}
            onClose={() => setShowClientsModal(false)}
            clients={data?.activeClientsList ?? []}
          />
        </div>
      )}
    </CinematicShell>
  );
}
