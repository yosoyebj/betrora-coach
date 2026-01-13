"use client";

import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import type { CoachTask } from "../lib/types";

type GuidanceTaskEditProps = {
  task: CoachTask;
  onTaskUpdated: () => void;
  onClose: () => void;
};

export function GuidanceTaskEdit({
  task,
  onTaskUpdated,
  onClose,
}: GuidanceTaskEditProps) {
  const [taskText, setTaskText] = useState(task.task_text);
  const [subtasks, setSubtasks] = useState<string[]>(
    task.task_subtasks || []
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setTaskText(task.task_text);
    setSubtasks(task.task_subtasks || []);
  }, [task]);

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

  const handleSave = async () => {
    if (!taskText.trim()) return;

    setIsSaving(true);
    const supabase = createSupabaseBrowserClient();

    const validSubtasks = subtasks.filter((s) => s.trim());
    const updateData: any = {
      task_text: taskText.trim(),
      task_subtasks: validSubtasks.length > 0 ? validSubtasks : null,
    };

    const { error } = await supabase
      .from("coach_tasks")
      .update(updateData)
      .eq("id", task.id);

    setIsSaving(false);

    if (error) {
      console.error("Error updating task:", error);
      return;
    }

    onTaskUpdated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-end md:items-center md:justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative backdrop-blur-xl bg-gradient-to-br from-white/[0.08] via-white/[0.06] to-white/[0.04] border-t md:border border-white/10 rounded-t-[20px] md:rounded-[20px] p-6 pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-6 w-full md:max-w-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-0 fade-in duration-300 max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <h3 className="text-lg font-bold text-white">Edit Task</h3>
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Task Text
            </label>
            <input
              type="text"
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              className="w-full p-3 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none"
              placeholder="Task description"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Subtasks
            </label>
            <div className="flex flex-col gap-2">
              {subtasks.map((st, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={st}
                    onChange={(e) => updateSubtask(i, e.target.value)}
                    placeholder={`Step ${i + 1}...`}
                    className="flex-1 p-2 backdrop-blur-sm bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none"
                  />
                  <button
                    onClick={() => removeSubtask(i)}
                    className="text-slate-600 hover:text-red-400 p-1"
                  >
                    <svg
                      width="16"
                      height="16"
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
                  className="flex items-center gap-2 px-2 py-1.5 text-xs font-bold text-slate-500 hover:text-indigo-400 transition-colors w-max"
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
                  Add step ({subtasks.length}/5)
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-800/50 hover:bg-slate-700/50 text-white font-semibold rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!taskText.trim() || isSaving}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white font-semibold rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-500/20 disabled:shadow-none"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
