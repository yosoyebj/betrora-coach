"use client";

import { useRouter } from "next/navigation";
import { CinematicShell } from "../../../components/CinematicShell";
import { useSupabaseAuth } from "../../../hooks/useSupabaseAuth";
import { useCoachRole } from "../../../hooks/useSupabaseAuth";
import useSWR from "swr";
import { createSupabaseBrowserClient } from "../../../lib/supabaseClient";
import type { CoachSession } from "../../../lib/types";
import SessionList from "../components/SessionList";

async function fetchLiveSessions() {
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

  // Fetch sessions happening now or in the next hour (live/active sessions)
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

  const { data: liveSessions, error } = await supabase
    .from("coach_sessions")
    .select(`
      id,
      user_id,
      coach_id,
      subscription_id,
      scheduled_at,
      duration_minutes,
      timezone,
      status,
      meeting_link,
      meeting_id,
      meeting_password,
      coach_notes,
      user_notes,
      created_at,
      updated_at,
      completed_at,
      cancelled_at
    `)
    .eq("coach_id", coachId)
    .eq("status", "scheduled")
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", oneHourLater.toISOString())
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.error("Error fetching live sessions:", error);
    return [];
  }

  // Fetch user details separately
  const sessions = liveSessions || [];
  const userIds = [...new Set(sessions.map((s: any) => s.user_id).filter(Boolean))];
  
  let userMap = new Map();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", userIds);
    
    userMap = new Map(users?.map((u: any) => [u.id, u]) || []);
  }

  // Map users to sessions
  return sessions.map((session: any) => ({
    ...session,
    user: userMap.get(session.user_id) || null,
  }));
}

export default function LiveSessionsPage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const { coach, isCoach, loading: coachLoading } = useCoachRole();
  const { data: sessions = [], mutate } = useSWR("live-sessions", fetchLiveSessions, {
    refreshInterval: 30000, // Refresh every 30 seconds for live sessions
  });

  if (!loading && !user) {
    router.replace("/login");
  }

  if (coachLoading) {
    return (
      <CinematicShell>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-slate-400">Loading...</div>
        </div>
      </CinematicShell>
    );
  }

  if (!isCoach) {
    return (
      <CinematicShell>
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6 text-sm text-slate-100 shadow-xl shadow-amber-500/10">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
            Coach access required
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-50">
            You&apos;re signed in, but not as a coach.
          </h1>
        </div>
      </CinematicShell>
    );
  }

  return (
    <CinematicShell>
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 shadow-2xl shadow-amber-500/20">
          <div className="max-w-xl space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
              Live Sessions
            </p>
            <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
              Active & Upcoming Sessions
            </h1>
            <p className="text-sm text-slate-300/90">
              Sessions happening now or in the next hour. Auto-refreshes every 30 seconds.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5">
          <h2 className="text-lg font-semibold text-slate-50 mb-4">
            Live Sessions ({sessions.length})
          </h2>
          {sessions.length > 0 ? (
            <SessionList sessions={sessions as CoachSession[]} onUpdate={mutate} />
          ) : (
            <p className="text-sm text-slate-400">No live sessions at the moment</p>
          )}
        </section>
      </div>
    </CinematicShell>
  );
}
