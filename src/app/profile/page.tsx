"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { CinematicShell } from "../../components/CinematicShell";
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import { useCoachRole } from "../../hooks/useSupabaseAuth";
import { createSupabaseBrowserClient } from "../../lib/supabaseClient";
import { CoachProfileForm } from "../../components/CoachProfileForm";
import type { Coach } from "../../lib/types";

async function fetchCoachProfile() {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("coaches")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return data as Coach | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const { isCoach } = useCoachRole();
  const { data: coach } = useSWR("coach-profile", fetchCoachProfile);

  if (!loading && !user) {
    router.replace("/login");
  }

  return (
    <CinematicShell>
      {!coach ? (
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6 text-sm text-slate-100 shadow-xl shadow-amber-500/10">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
            Coach profile
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-50">
            No coach profile found.
          </h1>
          <p className="mt-2 text-sm text-slate-300/90">
            You&apos;re signed in, but this account doesn&apos;t have a coach profile
            yet. Reach out to Betrora to be onboarded as a coach.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
              Coach profile
            </p>
            <h1 className="text-xl font-semibold text-slate-50">
              {coach.full_name ?? "Your profile"}
            </h1>
            <p className="text-sm text-slate-300/90">
              Tune how you appear to clients: bio, specialties, and availability
              all update your presence across Betrora.
            </p>
          </section>

          <section className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/50">
            <CoachProfileForm coach={coach} />
          </section>
        </div>
      )}
    </CinematicShell>
  );
}
