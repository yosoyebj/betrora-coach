import React from "react";
import type { CoachMessage } from "../lib/types";

interface MessageListProps {
  messages: CoachMessage[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

export function MessageList({ messages, selectedId, onSelect }: MessageListProps) {
  if (!messages.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/60 p-4 text-xs text-slate-400/90">
        No messages yet.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {messages.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onSelect(m.id)}
            className={`focus-outline flex w-full flex-col items-start rounded-2xl border px-3 py-2.5 text-left text-xs transition-all ${
              selectedId === m.id
                ? "border-amber-400/90 bg-slate-900/90 shadow-lg shadow-amber-500/30"
                : "border-slate-800/80 bg-slate-950/70 hover:border-slate-700 hover:bg-slate-900/80"
            }`}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="line-clamp-1 text-sm font-medium text-slate-50">
                {m.message}
              </span>
              <span className="rounded-full bg-slate-900/90 px-2 py-0.5 text-[10px] uppercase tracking-[0.22em] text-amber-300/90">
                {m.status}
              </span>
            </div>
            <span className="mt-1 text-[11px] text-slate-400/90">
              {new Date(m.created_at).toLocaleString()}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
