import React, { useState } from "react";
import type { CoachMessage } from "../lib/types";

interface MessageDetailProps {
  message: CoachMessage | null;
  userProfile?: { full_name: string | null; email: string | null } | null;
  onStatusChange?: (status: CoachMessage["status"]) => void;
}

const cannedReplies = [
  "Beautiful progress here—let's lock in one tiny next step together.",
  "Thank you for being honest about the resistance. What would make this feel 20% lighter?",
  "You don't need more willpower, just a smaller starting point. Let's find it.",
];

export function MessageDetail({ message, userProfile, onStatusChange }: MessageDetailProps) {
  const [note, setNote] = useState("");
  const [selectedReply, setSelectedReply] = useState<string | null>(null);

  if (!message) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/60 p-4 text-xs text-slate-400/90">
        Select a message to see details.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4 text-sm text-slate-100 shadow-xl shadow-black/50">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.26em] text-amber-300/80">
          Client message
        </p>
        <p className="text-sm leading-relaxed text-slate-100">{message.message}</p>
      </div>

      {userProfile && (
        <div className="mt-2 rounded-xl bg-slate-900/80 px-3 py-2 text-xs text-slate-300/90">
          <p className="font-medium text-slate-100">
            {userProfile.full_name ?? "Client"}
          </p>
          {userProfile.email && <p className="text-slate-400/90">{userProfile.email}</p>}
        </div>
      )}

      <div className="mt-3 space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-slate-400/90">
          Canned replies (local only)
        </p>
        <div className="flex flex-wrap gap-2">
          {cannedReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => setSelectedReply(reply)}
              className={`focus-outline rounded-full px-3 py-1 text-[11px] text-slate-100 transition ${
                selectedReply === reply
                  ? "bg-amber-500 text-slate-950 shadow-amber-500/40"
                  : "bg-slate-800/90 hover:bg-slate-700/90"
              }`}
            >
              {reply}
            </button>
          ))}
        </div>
        {selectedReply && (
          <textarea
            value={selectedReply + (note ? "\n\n" + note : "")}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="focus-outline mt-2 w-full rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5 text-xs text-slate-50 shadow-inner shadow-black/50"
            placeholder="Add your personal notes (local only)..."
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onStatusChange?.("read")}
            className="focus-outline rounded-full bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700/90"
          >
            Mark read
          </button>
          <button
            type="button"
            onClick={() => onStatusChange?.("replied")}
            className="focus-outline rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-md shadow-amber-500/40 hover:bg-amber-400"
          >
            Mark replied
          </button>
        </div>
      </div>
    </div>
  );
}
