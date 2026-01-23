"use client";

import { useState } from "react";
import { CoachSession } from "../../../lib/types";
import MeetingLinkForm from "./MeetingLinkForm";
import { createSupabaseBrowserClient } from "../../../lib/supabaseClient";

interface SessionListProps {
  sessions: CoachSession[];
  onUpdate?: () => void;
  readOnly?: boolean;
}

function formatDateTime(dateStr: string, timezone: string | null): string {
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
  } catch {
    return date.toLocaleString();
  }
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    scheduled: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    completed: "bg-slate-500/20 text-slate-300 border-slate-500/40",
    cancelled: "bg-red-500/20 text-red-300 border-red-500/40",
    no_show: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    rescheduled: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    pending_approval: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  };
  return colors[status] || colors.scheduled;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    scheduled: "Scheduled",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No Show",
    rescheduled: "Rescheduled",
    pending_approval: "Pending Approval",
  };
  return labels[status] || "Scheduled";
}

export default function SessionList({
  sessions,
  onUpdate,
  readOnly = false,
}: SessionListProps) {
  const [selectedSession, setSelectedSession] = useState<CoachSession | null>(
    null
  );
  const [showMeetingForm, setShowMeetingForm] = useState(false);

  const handleMarkComplete = async (sessionId: string) => {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        alert("Not authenticated. Please refresh and try again.");
        return;
      }

      const res = await fetch("/api/coach-sessions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          status: "completed",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to mark session as complete");
      }

      // Refresh the session list
      onUpdate?.();
    } catch (error: any) {
      console.error("Error marking session as complete:", error);
      alert(error.message || "Failed to mark session as complete");
    }
  };

  const handleMarkNoShow = async (sessionId: string) => {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        alert("Not authenticated. Please refresh and try again.");
        return;
      }

      const res = await fetch("/api/coach-sessions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          status: "no_show",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to mark session as no show");
      }

      // Refresh the session list
      onUpdate?.();
    } catch (error: any) {
      console.error("Error marking session as no show:", error);
      alert(error.message || "Failed to mark session as no show");
    }
  };

  return (
    <>
      <div className="space-y-3">
        {sessions.map((session) => {
          const userName =
            session.user?.full_name || session.user?.email || "Client";
          const isScheduled = session.status === "scheduled" || session.status === "rescheduled" || session.status === "pending_approval";

          return (
            <div
              key={session.id}
              className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-50 mb-1">
                    {userName}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {formatDateTime(session.scheduled_at, session.timezone)}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${getStatusColor(
                    session.status
                  )}`}
                >
                  {getStatusLabel(session.status)}
                </span>
              </div>

              {session.meeting_link && (
                <div className="mb-3">
                  <a
                    href={session.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-amber-300 hover:text-amber-200 underline"
                  >
                    Join Meeting
                  </a>
                </div>
              )}

              {!readOnly && isScheduled && (
                <div className="flex gap-2 mt-3">
                  {!session.meeting_link && (
                    <button
                      onClick={() => {
                        setSelectedSession(session);
                        setShowMeetingForm(true);
                      }}
                      className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
                    >
                      Add Meeting Link
                    </button>
                  )}
                  <button
                    onClick={() => handleMarkComplete(session.id)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors"
                  >
                    Mark Complete
                  </button>
                  <button
                    onClick={() => handleMarkNoShow(session.id)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-colors"
                  >
                    No Show
                  </button>
                </div>
              )}

              {session.coach_notes && (
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <p className="text-xs text-slate-400 italic">
                    {session.coach_notes}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showMeetingForm && selectedSession && (
        <MeetingLinkForm
          session={selectedSession}
          isOpen={showMeetingForm}
          onClose={() => {
            setShowMeetingForm(false);
            setSelectedSession(null);
          }}
          onSuccess={() => {
            setShowMeetingForm(false);
            setSelectedSession(null);
            onUpdate?.();
          }}
        />
      )}
    </>
  );
}
