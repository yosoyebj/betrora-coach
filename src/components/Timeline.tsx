import React from "react";

export interface TimelineItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  status?: string;
}

interface TimelineProps {
  items: TimelineItem[];
}

export function Timeline({ items }: TimelineProps) {
  return (
    <div className="relative space-y-4">
      <div className="absolute left-3 top-0 h-full w-px bg-slate-800/80" />
      {items.map((item, index) => (
        <div key={item.id} className="relative flex gap-4 pl-6">
          <div className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_0_4px_rgba(120,53,15,0.9)]" />
          </div>
          <div className="flex-1 rounded-xl border border-slate-800/80 bg-slate-900/70 px-3 py-2.5 shadow-md shadow-black/40">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-50">{item.title}</p>
              {item.status && (
                <span className="rounded-full bg-slate-800/90 px-2 py-0.5 text-[10px] uppercase tracking-[0.22em] text-amber-300/90">
                  {item.status}
                </span>
              )}
            </div>
            {item.subtitle && (
              <p className="mt-1 text-xs text-slate-300/90">{item.subtitle}</p>
            )}
            {item.meta && (
              <p className="mt-1 text-[11px] text-slate-400/90">{item.meta}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
