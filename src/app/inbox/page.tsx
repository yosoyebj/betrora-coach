"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { CinematicShell } from "../../components/CinematicShell";
import { useSupabaseAuth, useCoachRole } from "../../hooks/useSupabaseAuth";
import { createSupabaseBrowserClient } from "../../lib/supabaseClient";
import type { CoachMessage } from "../../lib/types";
import { MessageList } from "../../components/MessageList";
import { MessageDetail } from "../../components/MessageDetail";

async function fetchInbox(statusFilter: string | null) {
  const supabase = createSupabaseBrowserClient();
  
  // Get Supabase Auth user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Get coach record by user_id
  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!coach) return [];

  const coachId = coach.id;

  // Fetch messages directly from Supabase
  let query = supabase
    .from("coach_messages")
    .select("*")
    .eq("coach_id", coachId);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching inbox:", error);
    return [];
  }

  return (data || []) as CoachMessage[];
}

export default function InboxPage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const { isCoach, loading: coachLoading } = useCoachRole();
  const [statusFilter, setStatusFilter] = useState<string | null>("pending");
  const { data: messages = [], mutate } = useSWR(
    ["inbox", statusFilter],
    () => fetchInbox(statusFilter),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!loading && !user) {
    router.replace("/login");
  }

  const selectedMessage = messages.find((m) => m.id === selectedId) ?? null;

  const updateStatus = async (status: CoachMessage["status"]) => {
    if (!selectedMessage) return;
    const supabase = createSupabaseBrowserClient();

    const { error } = await supabase
      .from("coach_messages")
      .update({ status })
      .eq("id", selectedMessage.id);

    if (error) {
      console.error("Error updating message status:", error);
      return;
    }

    mutate();
  };

  return (
    <CinematicShell>
      {!coachLoading && !isCoach ? (
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6 text-sm text-slate-100 shadow-xl shadow-amber-500/10">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
            Coach access required
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-50">
            Inbox is only for approved coaches.
          </h1>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)]">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-amber-300/90">
                  Inbox
                </p>
                <h1 className="text-lg font-semibold text-slate-50">
                  Client messages
                </h1>
              </div>
              <div className="flex gap-1 rounded-full border border-slate-800/80 bg-slate-950/70 p-1 text-[11px]">
                {["pending", "read", "replied"].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`focus-outline rounded-full px-3 py-1 capitalize transition ${
                      statusFilter === status
                        ? "bg-amber-500 text-slate-950"
                        : "bg-transparent text-slate-300 hover:bg-slate-800/80"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <MessageList
              messages={messages}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </section>
          <section>
            <MessageDetail
              message={selectedMessage}
              onStatusChange={updateStatus}
            />
          </section>
        </div>
      )}
    </CinematicShell>
  );
}
