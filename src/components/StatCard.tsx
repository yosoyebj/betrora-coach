import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  trendLabel?: string;
  accent?: "cyan" | "emerald" | "amber" | "rose";
}

const accentMap: Record<NonNullable<StatCardProps["accent"]>, string> = {
  cyan: "from-amber-400/80 via-orange-500/60 to-amber-300/20",
  emerald: "from-emerald-400/80 via-emerald-500/50 to-emerald-300/20",
  amber: "from-amber-400/80 via-amber-500/50 to-amber-300/20",
  rose: "from-rose-400/80 via-rose-500/50 to-rose-300/20",
};

export function StatCard({ label, value, trendLabel, accent = "cyan" }: StatCardProps) {
  const accentClass = accentMap[accent];

  return (
    <div className="glass-panel relative overflow-hidden rounded-2xl p-4 sm:p-5">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${accentClass}`} />
      <div className="relative flex flex-col gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-slate-300/90">
          {label}
        </p>
        <p className="text-2xl font-semibold text-slate-50 sm:text-3xl">
          {value}
        </p>
        {trendLabel && (
          <p className="text-xs text-slate-300/80">{trendLabel}</p>
        )}
      </div>
    </div>
  );
}
