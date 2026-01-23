"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabaseClient";
import { CoachSession } from "../../../lib/types";

interface MeetingLinkFormProps {
  session: CoachSession;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function MeetingLinkForm({
  session,
  isOpen,
  onClose,
  onSuccess,
}: MeetingLinkFormProps) {
  const [meetingLink, setMeetingLink] = useState(session.meeting_link || "");
  const [meetingId, setMeetingId] = useState(session.meeting_id || "");
  const [meetingPassword, setMeetingPassword] = useState(
    session.meeting_password || ""
  );
  const [coachNotes, setCoachNotes] = useState(session.coach_notes || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!meetingLink.trim()) {
      setError("Meeting link is required");
      return;
    }

    // Validate URL
    try {
      new URL(meetingLink);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Not authenticated");
      }

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        throw new Error("No session token");
      }

      const res = await fetch("/api/coach-sessions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: session.id,
          meeting_link: meetingLink.trim(),
          meeting_id: meetingId.trim() || null,
          meeting_password: meetingPassword.trim() || null,
          coach_notes: coachNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update session");
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to update session");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-50">
            Meeting Details
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Meeting Link *
            </label>
            <input
              type="url"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://zoom.us/j/..."
              className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Meeting ID (optional)
            </label>
            <input
              type="text"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              placeholder="123 456 7890"
              className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Password (optional)
            </label>
            <input
              type="text"
              value={meetingPassword}
              onChange={(e) => setMeetingPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Coach Notes (optional)
            </label>
            <textarea
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              placeholder="Add notes about this session..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/20 border border-red-500/40 p-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
