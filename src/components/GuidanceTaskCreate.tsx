"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import type { CoachTask } from "../lib/types";

type GuidanceTaskCreateProps = {
  userId: string;
  coachId: string;
  onTaskCreated: () => void;
};

export function GuidanceTaskCreate({
  userId,
  coachId,
  onTaskCreated,
}: GuidanceTaskCreateProps) {
  const [text, setText] = useState("");
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const addSubtaskField = () => {
    if (subtasks.length < 5) {
      setSubtasks([...subtasks, ""]);
    }
  };

  const updateSubtask = (index: number, value: string) => {
    const newSubtasks = [...subtasks];
    newSubtasks[index] = value;
    setSubtasks(newSubtasks);
  };

  const removeSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!text.trim() || isCreating) return;

    setIsCreating(true);
    const supabase = createSupabaseBrowserClient();

    const validSubtasks = subtasks.filter((s) => s.trim());

    const { error } = await supabase.from("coach_tasks").insert({
      user_id: userId,
      coach_id: coachId,
      task_text: text.trim(),
      task_subtasks: validSubtasks.length > 0 ? validSubtasks : null,
      status: "pending",
      completed_subtasks: [],
    });

    setIsCreating(false);

    if (error) {
      console.error("Error creating task:", error);
      return;
    }

    setText("");
    setSubtasks([]);
    setIsExpanded(false);
    onTaskCreated();
  };

  return (
    <div className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-xl shadow-black/50">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="What's the next focus for this client?"
            className="flex-1 bg-transparent border-none outline-none text-base text-white placeholder:text-slate-500 h-10 w-full min-w-0"
            disabled={isCreating}
            onFocus={() => {
              setIsExpanded(true);
              if (subtasks.length === 0) setSubtasks([""]);
            }}
          />

          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isCreating}
            className="h-10 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white text-sm font-semibold transition-all active:scale-95 shadow-lg shadow-indigo-500/20 disabled:shadow-none whitespace-nowrap backdrop-blur-sm border border-white/10"
          >
            {isCreating ? "..." : "Create"}
          </button>
        </div>

        {(isExpanded || subtasks.length > 0) && (
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10 animate-in slide-in-from-top-2 fade-in duration-200">
            {subtasks.map((st, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 animate-in fade-in slide-in-from-left-1"
              >
                <svg
                  className="w-4 h-4 text-indigo-400 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <input
                  type="text"
                  value={st}
                  onChange={(e) => updateSubtask(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (i === subtasks.length - 1) addSubtaskField();
                    }
                    if (e.key === "Backspace" && !st && i > 0) {
                      e.preventDefault();
                      removeSubtask(i);
                    }
                  }}
                  autoFocus={i === subtasks.length - 1 && i > 0}
                  placeholder={`Step ${i + 1}...`}
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-300 placeholder:text-slate-600 h-9 font-medium"
                />
                <button
                  onClick={() => removeSubtask(i)}
                  className="text-slate-600 hover:text-red-400 p-1"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {subtasks.length < 5 && (
              <button
                onClick={addSubtaskField}
                className="flex items-center gap-2 px-2 py-1.5 text-xs font-bold text-slate-500 hover:text-indigo-400 transition-colors w-max ml-1"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add {subtasks.length > 0 ? "another step" : "steps"} (
                {subtasks.length}/5)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
