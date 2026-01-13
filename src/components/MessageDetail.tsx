import React, { useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import type { CoachMessage } from "../lib/types";

interface MessageDetailProps {
  message: CoachMessage | null;
  userProfile?: { full_name: string | null; email: string | null } | null;
  onStatusChange?: (status: CoachMessage["status"]) => void;
  onReplySent?: () => void;
}

const cannedReplies = [
  "Beautiful progress here—let's lock in one tiny next step together.",
  "Thank you for being honest about the resistance. What would make this feel 20% lighter?",
  "You don't need more willpower, just a smaller starting point. Let's find it.",
];

export function MessageDetail({ message, userProfile, onStatusChange, onReplySent }: MessageDetailProps) {
  const [note, setNote] = useState("");
  const [selectedReply, setSelectedReply] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);

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
        <textarea
          value={replyText || (selectedReply ? selectedReply + (note ? "\n\n" + note : "") : "")}
          onChange={(e) => {
            if (selectedReply) {
              setNote(e.target.value.replace(selectedReply, "").replace(/^\n\n/, ""));
            } else {
              setReplyText(e.target.value);
            }
          }}
          rows={4}
          className="focus-outline mt-2 w-full rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5 text-xs text-slate-50 shadow-inner shadow-black/50"
          placeholder={selectedReply ? "Add your personal notes..." : "Type your reply here..."}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onStatusChange?.(message.status === "read" ? "pending" : "read")}
            className="focus-outline rounded-full bg-slate-800/90 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700/90"
          >
            {message.status === "read" ? "Mark as unread" : "Mark read"}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!message) return;
              
              const finalReply = replyText || (selectedReply ? selectedReply + (note ? "\n\n" + note : "") : "");
              if (!finalReply.trim()) {
                alert("Please enter a reply message");
                return;
              }

              setIsSending(true);
              const supabase = createSupabaseBrowserClient();

              try {
                // Get session token
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) {
                  throw new Error("Not authenticated");
                }

                // Update the message with coach response and mark as replied
                // Set user_read_at = NULL so it shows as unread for the user
                // Note: We do NOT automatically mark as read - coach must manually click "Mark read"
                const { error: updateError } = await supabase
                  .from("coach_messages")
                  .update({
                    coach_response: finalReply.trim(),
                    status: "replied",
                    responded_at: new Date().toISOString(),
                    user_read_at: null, // NULL means unread - user hasn't read this response yet
                  })
                  .eq("id", message.id);

                if (updateError) {
                  console.error("Error sending reply:", updateError);
                  alert("Failed to send reply. Please try again.");
                  setIsSending(false);
                  return;
                }

                // Clear the reply fields
                setReplyText("");
                setSelectedReply(null);
                setNote("");
                
                // Notify parent to refresh
                onReplySent?.();
                onStatusChange?.("replied");
              } catch (error) {
                console.error("Error sending reply:", error);
                alert("Failed to send reply. Please try again.");
              } finally {
                setIsSending(false);
              }
            }}
            disabled={isSending || (!replyText.trim() && !selectedReply)}
            className="focus-outline rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-md shadow-amber-500/40 hover:from-amber-400 hover:to-orange-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 disabled:shadow-none transition-all"
          >
            {isSending ? "Sending..." : "Reply"}
          </button>
        </div>
      </div>
    </div>
  );
}
