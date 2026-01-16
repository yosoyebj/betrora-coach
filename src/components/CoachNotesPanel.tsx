"use client";

import React, { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import type { CoachNote } from "../lib/types";

interface CoachNotesPanelProps {
  userId: string | null | undefined;
}

async function fetchCoachNote(userId: string): Promise<CoachNote | null> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`/api/coach-notes?user_id=${userId}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 403) {
      return null;
    }
    throw new Error("Failed to fetch coach note");
  }

  const data = await response.json();
  return data.note;
}

async function saveCoachNote(userId: string, note: string): Promise<CoachNote> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch("/api/coach-notes", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId, note }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Failed to save coach note");
  }

  const data = await response.json();
  return data.note;
}

export function CoachNotesPanel({ userId }: CoachNotesPanelProps) {
  const [localNote, setLocalNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: note, mutate, isLoading } = useSWR<CoachNote | null>(
    userId ? ["coach-note", userId] : null,
    () => (userId ? fetchCoachNote(userId) : null),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  useEffect(() => {
    if (note) {
      setLocalNote(note.note || "");
      setLastSaved(new Date(note.updated_at));
      setHasUnsavedChanges(false);
    } else if (note === null && userId) {
      setLocalNote("");
      setLastSaved(null);
      setHasUnsavedChanges(false);
    }
  }, [note, userId]);

  // Debounced autosave
  useEffect(() => {
    if (!userId || !hasUnsavedChanges) return;

    const timeoutId = setTimeout(async () => {
      setIsSaving(true);
      setSaveError(null);

      try {
        const savedNote = await saveCoachNote(userId, localNote);
        setLastSaved(new Date(savedNote.updated_at));
        setHasUnsavedChanges(false);
        mutate(savedNote, false);
      } catch (error: any) {
        console.error("Error saving coach note:", error);
        setSaveError(error.message || "Failed to save note");
      } finally {
        setIsSaving(false);
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [localNote, userId, hasUnsavedChanges, mutate]);

  const handleManualSave = useCallback(async () => {
    if (!userId) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const savedNote = await saveCoachNote(userId, localNote);
      setLastSaved(new Date(savedNote.updated_at));
      setHasUnsavedChanges(false);
      mutate(savedNote, false);
    } catch (error: any) {
      console.error("Error saving coach note:", error);
      setSaveError(error.message || "Failed to save note");
    } finally {
      setIsSaving(false);
    }
  }, [userId, localNote, mutate]);

  if (!userId) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-slate-700/80 bg-slate-950/60 p-4 text-xs text-slate-400/90">
        <div className="text-center">
          <p className="mb-1">Select a client to view notes</p>
          <p className="text-[10px] text-slate-500/90">
            Private coach notes - never visible to client.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-3xl border-l-4 border-indigo-500/80 border border-slate-800/80 bg-gradient-to-br from-indigo-950/40 via-slate-950/80 to-slate-950/80 p-4 text-sm text-slate-100 shadow-xl shadow-indigo-500/10">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-indigo-300/90"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-[0.26em] text-indigo-300/90 font-semibold">
            Coach notes
          </p>
          <p className="text-[10px] text-slate-400/90 italic mt-0.5">
            Private coach notes - never visible to client.
          </p>
        </div>
      </div>

      <textarea
        value={localNote}
        onChange={(e) => {
          setLocalNote(e.target.value);
          setHasUnsavedChanges(true);
          setSaveError(null);
        }}
        rows={8}
        className="focus-outline w-full resize-none rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5 text-xs text-slate-50 shadow-inner shadow-black/50 placeholder:text-slate-500/50"
        placeholder="Add your private notes about this client..."
        disabled={isLoading}
      />

      {saveError && (
        <div className="rounded-lg bg-red-950/50 border border-red-800/50 px-3 py-2 text-xs text-red-200/90">
          <p className="font-medium">Error saving note</p>
          <p className="text-[10px] mt-0.5">{saveError}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 text-xs">
          {isLoading ? (
            <span className="text-slate-400/90">Loading...</span>
          ) : isSaving ? (
            <span className="text-amber-300/90">Saving...</span>
          ) : lastSaved ? (
            <span className="text-slate-400/90">
              Last saved:{" "}
              {lastSaved.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : hasUnsavedChanges ? (
            <span className="text-amber-300/90">Unsaved changes</span>
          ) : (
            <span className="text-slate-500/90">Saved</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleManualSave}
          disabled={isSaving || isLoading || !hasUnsavedChanges}
          className="focus-outline rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-md shadow-amber-500/40 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none transition-all"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
