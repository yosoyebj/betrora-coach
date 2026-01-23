"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CinematicShell } from "../../components/CinematicShell";
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import { useCoachRole } from "../../hooks/useSupabaseAuth";
import useSWR from "swr";
import { createSupabaseBrowserClient } from "../../lib/supabaseClient";
import { CoachAvailability } from "../../lib/types";
import AvailabilityEditor from "./components/AvailabilityEditor";

async function fetchAvailability() {
  const supabase = createSupabaseBrowserClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: coach } = await supabase
    .from("coaches")
    .select("id, timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!coach) return null;

  const coachId = coach.id;

  const { data: availability, error } = await supabase
    .from("coach_availability")
    .select("*")
    .eq("coach_id", coachId)
    .eq("is_active", true)
    .order("day_of_week", { ascending: true })
    .order("start_time_minutes", { ascending: true });

  if (error) {
    console.error("Error fetching availability:", error);
    return { availability: [], coachTimezone: coach.timezone || "UTC" };
  }

  return {
    availability: (availability as CoachAvailability[]) || [],
    coachTimezone: coach.timezone || "UTC",
  };
}

export default function AvailabilityPage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const { coach, isCoach, loading: coachLoading } = useCoachRole();
  const { data, mutate } = useSWR("coach-availability", fetchAvailability);

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
        <section className="flex flex-col gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 shadow-2xl shadow-amber-500/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
              Availability Management
            </p>
            <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
              Set your weekly availability
            </h1>
            <p className="text-sm text-slate-300/90">
              Define when you&apos;re available for sessions. Clients can only book during these times.
            </p>
          </div>
        </section>

        {data && (
          <AvailabilityEditor
            initialAvailability={data.availability}
            timezone={data.coachTimezone}
            onSave={mutate}
          />
        )}
      </div>
    </CinematicShell>
  );
}
