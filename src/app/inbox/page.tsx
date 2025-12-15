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
  const base = process.env.NEXT_PUBLIC_CALMORAA_API_BASE_URL;
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];

  const url = new URL("/api/coach-messages", base);
  if (statusFilter) url.searchParams.set("status", statusFilter);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load inbox");
  const data = await res.json();
  return data as CoachMessage[];
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
    const base = process.env.NEXT_PUBLIC_CALMORAA_API_BASE_URL;
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    await fetch(`${base}/api/coach-messages`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id: selectedMessage.id, status }),
    });

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
