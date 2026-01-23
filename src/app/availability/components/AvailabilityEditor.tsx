"use client";

import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabaseClient";
import { CoachAvailability } from "../../../lib/types";

interface AvailabilityEditorProps {
  initialAvailability: CoachAvailability[];
  timezone: string;
  onSave?: () => void;
}

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

export default function AvailabilityEditor({
  initialAvailability,
  timezone,
  onSave,
}: AvailabilityEditorProps) {
  const [availability, setAvailability] = useState<CoachAvailability[]>(initialAvailability);
  const [editingSlot, setEditingSlot] = useState<CoachAvailability | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAvailability(initialAvailability);
  }, [initialAvailability]);

  const getSlotsForDay = (dayOfWeek: number): CoachAvailability[] => {
    return availability.filter((slot) => slot.day_of_week === dayOfWeek);
  };

  const handleAddSlot = (dayOfWeek: number) => {
    const newSlot: Partial<CoachAvailability> = {
      id: `new-${Date.now()}`,
      coach_id: "",
      day_of_week: dayOfWeek,
      start_time_minutes: 540, // 9:00 AM
      end_time_minutes: 1020, // 5:00 PM
      timezone: timezone,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setEditingSlot(newSlot as CoachAvailability);
  };

  const handleEditSlot = (slot: CoachAvailability) => {
    setEditingSlot({ ...slot });
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm("Delete this availability slot?")) return;

    // If it's a new slot (not saved), just remove from state
    if (slotId.startsWith("new-")) {
      setAvailability((prev) => prev.filter((s) => s.id !== slotId));
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("No session token");

      const res = await fetch(`/api/coach-availability?id=${encodeURIComponent(slotId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete slot");
      }

      setAvailability((prev) => prev.filter((s) => s.id !== slotId));
      onSave?.();
    } catch (err: any) {
      setError(err.message || "Failed to delete slot");
    }
  };

  const handleSaveSlot = async () => {
    if (!editingSlot) return;

    const startMinutes = timeToMinutes(
      `${String(Math.floor(editingSlot.start_time_minutes / 60)).padStart(2, "0")}:${String(editingSlot.start_time_minutes % 60).padStart(2, "0")}`
    );
    const endMinutes = timeToMinutes(
      `${String(Math.floor(editingSlot.end_time_minutes / 60)).padStart(2, "0")}:${String(editingSlot.end_time_minutes % 60).padStart(2, "0")}`
    );

    if (endMinutes <= startMinutes) {
      setError("End time must be after start time");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("No session token");

      const isNew = editingSlot.id?.startsWith("new-");
      const payload = {
        day_of_week: editingSlot.day_of_week,
        start_time_minutes: startMinutes,
        end_time_minutes: endMinutes,
        timezone: editingSlot.timezone,
      };

      const res = isNew
        ? await fetch("/api/coach-availability", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/coach-availability", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              id: editingSlot.id,
              ...payload,
            }),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save slot");
      }

      const data = await res.json();
      const savedSlot = data.availability;

      if (isNew) {
        setAvailability((prev) => [...prev, savedSlot]);
      } else {
        setAvailability((prev) =>
          prev.map((s) => (s.id === editingSlot.id ? savedSlot : s))
        );
      }

      setEditingSlot(null);
      onSave?.();
    } catch (err: any) {
      setError(err.message || "Failed to save slot");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-50 mb-2">Weekly Schedule</h2>
        <p className="text-sm text-slate-400">Timezone: {timezone}</p>
      </div>

      <div className="space-y-4">
        {DAYS.map((day) => {
          const slots = getSlotsForDay(day.value);
          return (
            <div key={day.value} className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-50">{day.label}</h3>
                <button
                  onClick={() => handleAddSlot(day.value)}
                  className="px-3 py-1 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
                >
                  + Add Slot
                </button>
              </div>

              {slots.length === 0 ? (
                <p className="text-xs text-slate-500">No availability set</p>
              ) : (
                <div className="space-y-2">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50"
                    >
                      <span className="text-xs text-slate-300">
                        {minutesToTime(slot.start_time_minutes)} - {minutesToTime(slot.end_time_minutes)}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditSlot(slot)}
                          className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700/50 bg-slate-900 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-50 mb-4">
              {editingSlot.id?.startsWith("new-") ? "Add" : "Edit"} Availability Slot
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={minutesToTime(editingSlot.start_time_minutes)}
                  onChange={(e) => {
                    const minutes = timeToMinutes(e.target.value);
                    setEditingSlot({ ...editingSlot, start_time_minutes: minutes });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={minutesToTime(editingSlot.end_time_minutes)}
                  onChange={(e) => {
                    const minutes = timeToMinutes(e.target.value);
                    setEditingSlot({ ...editingSlot, end_time_minutes: minutes });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-500/20 border border-red-500/40 p-3">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setEditingSlot(null);
                    setError(null);
                  }}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSlot}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
