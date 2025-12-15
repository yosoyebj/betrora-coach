"use client";

import { useState } from "react";
import type { Coach } from "../lib/types";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";

interface CoachProfileFormProps {
  coach: Coach;
  onSaved?: (coach: Coach) => void;
}

export function CoachProfileForm({ coach, onSaved }: CoachProfileFormProps) {
  const [form, setForm] = useState<Coach>(coach);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleChange = <K extends keyof Coach>(key: K, value: Coach[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    const { data, error } = await supabase
      .from("coaches")
      .update({
        full_name: form.full_name,
        avatar_url: form.avatar_url,
        specialties: form.specialties,
        languages: form.languages,
        bio: form.bio,
        timezone: form.timezone,
        calendar_link: form.calendar_link,
        availability_note: form.availability_note,
        status: form.status,
        client_limit: form.client_limit,
      })
      .eq("id", form.id)
      .select("*")
      .maybeSingle();

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data) {
      setForm(data as Coach);
      setSaved(true);
      onSaved?.(data as Coach);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm text-slate-100">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400/90">
            Name
          </label>
          <input
            value={form.full_name ?? ""}
            onChange={(e) => handleChange("full_name", e.target.value)}
            className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-50"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400/90">
            Timezone
          </label>
          <input
            value={form.timezone ?? ""}
            onChange={(e) => handleChange("timezone", e.target.value)}
            className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-50"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400/90">
          Bio
        </label>
        <textarea
          rows={4}
          value={form.bio ?? ""}
          onChange={(e) => handleChange("bio", e.target.value)}
          className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-50"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400/90">
            Specialties (comma separated)
          </label>
          <input
            value={form.specialties?.join(", ") ?? ""}
            onChange={(e) =>
              handleChange(
                "specialties",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-50"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400/90">
            Languages (comma separated)
          </label>
          <input
            value={form.languages?.join(", ") ?? ""}
            onChange={(e) =>
              handleChange(
                "languages",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-50"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400/90">
            Calendar link
          </label>
          <input
            value={form.calendar_link ?? ""}
            onChange={(e) => handleChange("calendar_link", e.target.value)}
            className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-50"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400/90">
            Availability note
          </label>
          <input
            value={form.availability_note ?? ""}
            onChange={(e) => handleChange("availability_note", e.target.value)}
            className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-50"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400/90">
            Status
          </label>
          <select
            value={form.status ?? ""}
            onChange={(e) => handleChange("status", e.target.value)}
            className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-50"
          >
            <option value="">Select...</option>
            <option value="active">Active</option>
            <option value="accepting">Accepting clients</option>
            <option value="paused">Paused</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400/90">
            Client limit
          </label>
          <input
            type="number"
            value={form.client_limit ?? ""}
            onChange={(e) =>
              handleChange("client_limit", e.target.value ? Number(e.target.value) : null)
            }
            className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-50"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400/90">
            Current clients
          </label>
          <input
            type="number"
            value={form.current_clients ?? ""}
            onChange={(e) =>
              handleChange(
                "current_clients",
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-950/70 px-3 py-2 text-sm text-slate-50"
          />
        </div>
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}
      {saved && !error && (
        <p className="text-xs text-emerald-300/90">Profile saved.</p>
      )}

      <div className="pt-1">
        <button
          type="submit"
          disabled={saving}
          className="focus-outline rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 shadow-md shadow-amber-500/40 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}
