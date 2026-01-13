import React, { useRef, useEffect } from "react";
import type { CoachMessage } from "../lib/types";

interface MessageListProps {
  messages: CoachMessage[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

export function MessageList({ messages, selectedId, onSelect }: MessageListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLLIElement>(null);
  const firstUnreadRef = useRef<HTMLLIElement>(null);
  const prevSelectedIdRef = useRef<string | null>(null);
  const hasScrolledToUnreadRef = useRef(false);

  // Find first unread message
  const firstUnreadMessage = messages.find((m) => m.status === "pending");

  // Scroll to first unread message when messages load (only once)
  useEffect(() => {
    if (firstUnreadMessage && !hasScrolledToUnreadRef.current && firstUnreadRef.current && containerRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        if (firstUnreadRef.current) {
          firstUnreadRef.current.scrollIntoView({
            behavior: 'instant',
            block: 'start',
          });
          hasScrolledToUnreadRef.current = true;
        }
      }, 100);
    }
  }, [firstUnreadMessage?.id, messages.length]);

  // Scroll to selected message instantly (not smoothly) when selection changes
  useEffect(() => {
    if (selectedId && selectedId !== prevSelectedIdRef.current && selectedRef.current) {
      // Use instant scroll instead of smooth to avoid slow scrolling with many messages
      selectedRef.current.scrollIntoView({
        behavior: 'instant', // Changed from 'auto' or 'smooth' to instant
        block: 'nearest', // Only scroll if not already visible
      });
      prevSelectedIdRef.current = selectedId;
    }
  }, [selectedId]);

  if (!messages.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/60 p-4 text-xs text-slate-400/90">
        No messages yet.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="max-h-[calc(100vh-300px)] overflow-y-auto overscroll-contain">
      <ul ref={listRef} className="space-y-2">
        {messages.map((m) => {
          const isUnread = m.status === "pending";
          const isFirstUnread = isUnread && m.id === firstUnreadMessage?.id;
          
          return (
            <li 
              key={m.id}
              ref={
                selectedId === m.id 
                  ? selectedRef 
                  : isFirstUnread 
                    ? firstUnreadRef 
                    : null
              }
            >
              {/* Unread indicator bar before first unread message */}
              {isFirstUnread && (
                <div className="mb-3 flex items-center gap-2 px-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
                    Unread Messages
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
                </div>
              )}
              
              <button
                type="button"
                onClick={() => onSelect(m.id)}
                className={`focus-outline flex w-full flex-col items-start rounded-2xl border px-3 py-2.5 text-left text-xs transition-all ${
                  selectedId === m.id
                    ? "border-amber-400/90 bg-slate-900/90 shadow-lg shadow-amber-500/30"
                    : isUnread
                      ? "border-amber-500/40 bg-amber-950/20 hover:border-amber-500/60 hover:bg-amber-950/30"
                      : "border-slate-800/80 bg-slate-950/70 hover:border-slate-700 hover:bg-slate-900/80"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className={`line-clamp-1 text-sm font-medium ${
                    isUnread ? "text-amber-100" : "text-slate-50"
                  }`}>
                    {m.message}
                  </span>
                  <div className="flex items-center gap-2">
                    {isUnread && (
                      <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.22em] ${
                      isUnread
                        ? "bg-amber-500/20 text-amber-300"
                        : m.status === "replied"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-slate-900/90 text-amber-300/90"
                    }`}>
                      {m.status}
                    </span>
                  </div>
                </div>
                <span className="mt-1 text-[11px] text-slate-400/90">
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
