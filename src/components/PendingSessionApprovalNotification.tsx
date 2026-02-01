"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";

type PendingSession = {
  id: string;
  user_id: string;
  scheduled_at: string;
  duration_minutes: number;
  timezone: string | null;
  user_notes: string | null;
  pending_approval_at: string;
  user?: {
    id: string;
    full_name: string | null;
    email: string;
  };
};

async function fetchPendingSessions(coachId: string | null): Promise<PendingSession[]> {
  if (!coachId) return [];

  const supabase = createSupabaseBrowserClient();

  const { data: sessions, error } = await supabase
    .from("coach_sessions")
    .select(`
      id,
      user_id,
      scheduled_at,
      duration_minutes,
      timezone,
      user_notes,
      pending_approval_at
    `)
    .eq("coach_id", coachId)
    .eq("status", "pending_approval")
    .order("pending_approval_at", { ascending: true });

  if (error || !sessions || sessions.length === 0) {
    return [];
  }

  // Fetch user details
  const userIds = [...new Set(sessions.map((s: any) => s.user_id))];
  const { data: users } = await supabase
    .from("users")
    .select("id, full_name, email")
    .in("id", userIds);

  const usersMap = new Map(users?.map((u: any) => [u.id, u]) || []);

  return sessions.map((session: any) => ({
    ...session,
    user: usersMap.get(session.user_id) || null,
  }));
}

async function approveSession(sessionId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("coach_sessions")
    .update({
      status: "scheduled",
      approved_at: new Date().toISOString(),
      pending_approval_at: null,
    })
    .eq("id", sessionId);

  if (error) throw error;
}

async function rejectSession(sessionId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("coach_sessions")
    .update({
      status: "cancelled",
      rejected_at: new Date().toISOString(),
      pending_approval_at: null,
    })
    .eq("id", sessionId);

  if (error) throw error;
}

type PendingSessionApprovalNotificationProps = {
  coachId: string | null;
};

export function PendingSessionApprovalNotification({
  coachId,
}: PendingSessionApprovalNotificationProps) {
  const router = useRouter();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: pendingSessions = [], mutate, error } = useSWR(
    coachId ? ["pending-session-approvals", coachId] : null,
    () => (coachId ? fetchPendingSessions(coachId) : []),
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: true,
    }
  );

  const handleApprove = async (sessionId: string) => {
    setProcessingId(sessionId);
    try {
      await approveSession(sessionId);
      await mutate();
    } catch (err) {
      console.error("Error approving session:", err);
      alert("Failed to approve session. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (sessionId: string) => {
    if (!confirm("Are you sure you want to reject this session request?")) {
      return;
    }
    setProcessingId(sessionId);
    try {
      await rejectSession(sessionId);
      await mutate();
    } catch (err) {
      console.error("Error rejecting session:", err);
      alert("Failed to reject session. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  if (pendingSessions.length === 0) {
    return null;
  }

  const formatDateTime = (dateStr: string, timezone: string | null) => {
    const date = new Date(dateStr);
    const tz = timezone || "UTC";
    try {
      return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
        hour12: true,
      }).format(date);
    } catch (error) {
      return date.toLocaleString();
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-red-500/70 bg-gradient-to-br from-red-950/95 via-orange-950/90 to-amber-950/90 p-5 shadow-[0_20px_60px_-15px_rgba(239,68,68,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-xl animate-pulse">
      <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 via-orange-500/20 to-amber-500/20 animate-pulse opacity-60" />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-500/30 flex items-center justify-center border-2 border-red-400/50">
              <svg
                className="w-6 h-6 text-red-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-red-100 mb-1">
                ⚠️ Urgent: Session Approval Required
              </h3>
              <p className="text-xs text-red-200/80">
                {pendingSessions.length} session{pendingSessions.length > 1 ? "s" : ""} requested less than 24 hours in advance
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {pendingSessions.map((session) => {
            const userName = session.user?.full_name || session.user?.email || "Client";
            const isProcessing = processingId === session.id;

            return (
              <div
                key={session.id}
                className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 backdrop-blur-sm"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-100 mb-1">
                      {userName}
                    </p>
                    <p className="text-xs text-red-200/70">
                      {formatDateTime(session.scheduled_at, session.timezone)}
                    </p>
                    {session.user_notes && (
                      <p className="text-xs text-red-200/60 mt-1 italic">
                        Note: {session.user_notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleApprove(session.id)}
                    disabled={isProcessing}
                    className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? "Processing..." : "✓ Accept"}
                  </button>
                  <button
                    onClick={() => handleReject(session.id)}
                    disabled={isProcessing}
                    className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500/20 text-red-200 border border-red-500/40 hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? "Processing..." : "✗ Reject"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => router.push("/sessions")}
          className="mt-4 w-full px-4 py-2 text-xs font-semibold rounded-lg bg-red-500/20 text-red-200 border border-red-500/40 hover:bg-red-500/30 transition-colors"
        >
          View All Sessions →
        </button>
      </div>
    </div>
  );
}
