import React from "react";

export interface MoodEntry {
  date: string;
  mood: string;
  sleep_hours: number | null;
  exercise_minutes: number | null;
}

interface MoodHeatmapProps {
  entries: MoodEntry[];
}

const MOOD_INTENSITY: Record<string, number> = {
  Happy: 3,
  Excited: 3,
  Calm: 2,
  Tired: 2,
  Sad: 2,
  Anxious: 2,
  Frustrated: 2,
  Melancholy: 2,
};

export function MoodHeatmap({ entries }: MoodHeatmapProps) {
  if (!entries.length) {
    return (
      <p className="text-xs text-slate-400/90">
        No mood entries yet for this client.
      </p>
    );
  }

  const byDate = entries.reduce<Record<string, MoodEntry[]>>((acc, entry) => {
    const key = entry.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const days = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));

  const moodCounts: Record<string, number> = {};
  entries.forEach((e) => {
    moodCounts[e.mood] = (moodCounts[e.mood] ?? 0) + 1;
  });
  const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const avgSleep =
    entries.reduce((sum, e) => sum + (e.sleep_hours ?? 0), 0) /
    entries.length;
  const avgExercise =
    entries.reduce((sum, e) => sum + (e.exercise_minutes ?? 0), 0) /
    entries.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300/90">
        {topMood && (
          <span className="rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] text-amber-300">
            MOST COMMON MOOD: {topMood}
          </span>
        )}
        <span className="text-slate-400/90">
          Avg sleep: {avgSleep.toFixed(1)}h · Avg exercise: {avgExercise.toFixed(0)}m
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {days.map(([date, dayEntries]) => {
          const intensity = Math.min(
            3,
            dayEntries.reduce(
              (acc, e) => Math.max(acc, MOOD_INTENSITY[e.mood] ?? 1),
              1,
            ),
          );
          const bg =
            intensity === 3
              ? "bg-amber-400/90"
              : intensity === 2
              ? "bg-amber-400/60"
              : "bg-amber-400/30";

          return (
            <div
              key={date}
              className={`flex h-7 w-7 items-center justify-center rounded-md ${bg} text-[10px] font-medium text-slate-950 shadow-md shadow-amber-500/40`}
              title={`${date} • ${dayEntries
                .map((e) => e.mood)
                .join(", ")}`}
            >
              {new Date(date).getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
