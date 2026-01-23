"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CinematicShell } from "../../components/CinematicShell";
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import { useCoachRole } from "../../hooks/useSupabaseAuth";
import useSWR from "swr";
import { createSupabaseBrowserClient } from "../../lib/supabaseClient";
import { CoachSession } from "../../lib/types";
import SessionList from "./components/SessionList";

async function fetchSessions() {
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

  // Fetch upcoming sessions (including pending approval)
  const now = new Date().toISOString();
  const { data: upcomingSessions, error: upcomingError } = await supabase
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
      cancelled_at,
      pending_approval_at,
      approved_at,
      rejected_at
    `)
    .eq("coach_id", coachId)
    .gte("scheduled_at", now)
    .in("status", ["scheduled", "rescheduled", "pending_approval"])
    .order("scheduled_at", { ascending: true });

  // Fetch past sessions
  const { data: pastSessions, error: pastError } = await supabase
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
    .or(`scheduled_at.lt.${now},status.in.(completed,cancelled,no_show)`)
    .order("scheduled_at", { ascending: false })
    .limit(20);

  if (upcomingError || pastError) {
    console.error("Error fetching sessions:", upcomingError || pastError);
    return { upcoming: [], past: [] };
  }

  // Fetch user details separately
  const allSessions = [...(upcomingSessions || []), ...(pastSessions || [])];
  const userIds = [...new Set(allSessions.map((s: any) => s.user_id).filter(Boolean))];
  
  let userMap = new Map();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", userIds);
    
    userMap = new Map(users?.map((u: any) => [u.id, u]) || []);
  }

  // Map users to sessions
  const mapSessionsWithUsers = (sessions: any[]) => {
    return sessions.map((session: any) => ({
      ...session,
      user: userMap.get(session.user_id) || null,
    }));
  };

  return {
    upcoming: mapSessionsWithUsers((upcomingSessions as CoachSession[]) || []),
    past: mapSessionsWithUsers((pastSessions as CoachSession[]) || []),
  };
}

export default function SessionsPage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const { coach, isCoach, loading: coachLoading } = useCoachRole();
  const { data, mutate } = useSWR("coach-sessions", fetchSessions);

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
        <section className="rounded-xl border border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 shadow-lg shadow-amber-500/10">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">
              Session Management
            </p>
            <h1 className="text-base font-semibold text-slate-50">
              Manage your client sessions
            </h1>
            <p className="text-xs text-slate-300/70">
              View upcoming sessions, add meeting links, and track session history.
            </p>
          </div>
        </section>

        {/* Rescheduling Notice */}
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-2.5">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-blue-400 mt-0.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="space-y-1.5 flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-300">
                Important: Rescheduling Policy
              </p>
              <p className="text-[10px] text-blue-200/70 leading-relaxed">
                <strong>Only clients can reschedule sessions from their side.</strong> If you need to reschedule, message your client at least 24 hours in advance.
              </p>
              <p className="text-[10px] text-blue-200/70 leading-relaxed">
                <strong>Keep availability updated:</strong> Ensure your weekly availability is current so clients can reschedule to available times.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5">
            <h2 className="text-lg font-semibold text-slate-50 mb-4">
              Upcoming Sessions ({data?.upcoming?.length || 0})
            </h2>
            {data?.upcoming && data.upcoming.length > 0 ? (
              <SessionList sessions={data.upcoming} onUpdate={mutate} />
            ) : (
              <p className="text-sm text-slate-400">No upcoming sessions</p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5">
            <h2 className="text-lg font-semibold text-slate-50 mb-4">
              Past Sessions
            </h2>
            {data?.past && data.past.length > 0 ? (
              <SessionList sessions={data.past} onUpdate={mutate} readOnly />
            ) : (
              <p className="text-sm text-slate-400">No past sessions</p>
            )}
          </section>
        </div>
      </div>
    </CinematicShell>
  );
}
