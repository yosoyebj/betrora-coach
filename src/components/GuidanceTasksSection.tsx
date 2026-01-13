"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { useCoachRole } from "../hooks/useSupabaseAuth";
import { fetchClientGuidanceTasks } from "../lib/fetchGuidanceTasks";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import type { CoachTask } from "../lib/types";
import { GuidanceTaskCreate } from "./GuidanceTaskCreate";
import { GuidanceTaskEdit } from "./GuidanceTaskEdit";

type GuidanceTasksSectionProps = {
  userId: string;
  coachId: string | null;
};

function formatDate(dateString: string) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function StatusChip({ status }: { status: CoachTask["status"] }) {
  const styles = {
    pending: "bg-amber-500/10 text-amber-500/80 border-amber-500/20",
    active: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    completed: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    skipped: "bg-red-500/10 text-red-400/80 border-red-500/20",
  } as Record<string, string>;

  const cls = styles[status] || styles.pending;

  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${cls}`}
    >
      {status}
    </span>
  );
}

function GuidanceTaskItem({
  task,
  onEdit,
  onSubtaskToggle,
  onFeedbackSubmit,
}: {
  task: CoachTask;
  onEdit: () => void;
  onSubtaskToggle: (taskId: string, index: number) => void;
  onFeedbackSubmit: () => void;
}) {
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const subtasks = task.task_subtasks || [];
  const completedSubtasks = task.completed_subtasks || [];
  const needsFeedback = task.status === "completed" && !task.coach_feedback;

  const handleSubtaskToggle = (index: number) => {
    onSubtaskToggle(task.id, index);
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const supabase = createSupabaseBrowserClient();

    // Update the task with feedback
    const { data: updatedTask, error: updateError } = await supabase
      .from("coach_tasks")
      .update({ coach_feedback: feedbackText.trim() })
      .eq("id", task.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error submitting feedback:", updateError);
      alert(`Failed to submit feedback: ${updateError.message}`);
      setIsSubmitting(false);
      return;
    }

      // Send a beautifully designed message to the user via API
      try {
        // Get coach info for the message
        const { data: { user: coachUser } } = await supabase.auth.getUser();
        if (coachUser) {
          const { data: coach } = await supabase
            .from("coaches")
            .select("id, full_name")
            .eq("user_id", coachUser.id)
            .maybeSingle();

          if (coach) {
            const coachName = coach.full_name || "Your coach";
            // Create a clean, professional, masculine feedback message
            const taskPreview = task.task_text.length > 50 
              ? task.task_text.substring(0, 50) + "..." 
              : task.task_text;
            
            const messageContent = `Premium Feedback from ${coachName}\n\nYour coach has reviewed your completed task:\n"${taskPreview}"\n\nFeedback:\n${feedbackText.trim()}\n\nView full details: Check your completed tasks in Guidance for the complete feedback and insights.`;

            // Get session token for API call
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              // Call API route to send message
              const response = await fetch("/api/send-feedback-message", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  user_id: task.user_id,
                  coach_id: task.coach_id,
                  messageContent: messageContent,
                }),
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("Error sending message:", errorData);
              }
            }
          }
        }
      } catch (messageError) {
        console.error("Error sending message:", messageError);
        // Don't fail the feedback submission if message fails
      }

    setIsSubmitting(false);
    setFeedbackText("");
    onFeedbackSubmit();
  };

  return (
    <div className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/50">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <StatusChip status={task.status} />
            {task.created_at && (
              <span className="text-[10px] text-slate-500 font-medium">
                {formatDate(task.created_at)}
              </span>
            )}
            {task.completed_at && (
              <span className="text-[10px] text-slate-500 font-medium">
                Completed {formatDate(task.completed_at)}
              </span>
            )}
          </div>
          <p className="text-base font-semibold text-slate-50 mb-3">
            {task.task_text}
          </p>
        </div>
        <button
          onClick={onEdit}
          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          aria-label="Edit task"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>

      {subtasks.length > 0 && (
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 pb-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3">
              Steps
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>
          <div className="flex flex-col gap-2">
            {subtasks.map((sub, idx) => {
              const isDone = completedSubtasks.includes(idx);
              return (
                <div
                  key={idx}
                  className={`group/subtask flex items-start gap-3 p-3 rounded-xl border-2 backdrop-blur-sm transition-all cursor-pointer ${
                    isDone
                      ? "bg-emerald-500/10 border-emerald-500/40"
                      : "bg-white/5 border-white/15 hover:bg-white/8 hover:border-white/25"
                  }`}
                  onClick={() => handleSubtaskToggle(idx)}
                >
                  <div
                    className={`shrink-0 w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all duration-300 mt-0.5 ${
                      isDone
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-slate-400/60 bg-white/5 text-transparent group-hover/subtask:border-indigo-400"
                    }`}
                  >
                    {isDone && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span
                    className={`flex-1 text-sm font-medium transition-colors ${
                      isDone
                        ? "text-emerald-200 line-through decoration-emerald-400/60"
                        : "text-white"
                    }`}
                  >
                    {sub}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {task.notes && (
        <div className="mb-4 p-3 rounded-xl bg-slate-900/80 border border-slate-800/50">
          <p className="text-xs font-semibold text-amber-300/90 uppercase tracking-wider mb-2">
            Client Reflection
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">{task.notes}</p>
        </div>
      )}

      {needsFeedback && (
        <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-amber-950/90 via-orange-950/80 to-amber-950/90 border-2 border-amber-500/40 shadow-lg shadow-amber-500/20">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-amber-300 animate-pulse"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-300/90 uppercase tracking-wider mb-1">
                Provide Feedback
              </p>
              <p className="text-xs text-amber-200/70 mb-3">
                Your client completed this task and is waiting for your feedback.
              </p>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Share your thoughts, encouragement, or next steps..."
                className="w-full p-3 backdrop-blur-sm bg-white/5 border border-amber-400/30 rounded-lg text-sm text-white placeholder:text-amber-300/50 focus:border-amber-400/60 focus:outline-none resize-none mb-2"
                rows={3}
                disabled={isSubmitting}
              />
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedbackText.trim() || isSubmitting}
                className="w-full py-2 px-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white text-sm font-semibold rounded-lg transition-all active:scale-95 shadow-lg shadow-amber-500/30 disabled:shadow-none"
              >
                {isSubmitting ? "Submitting..." : "Submit Feedback"}
              </button>
            </div>
          </div>
        </div>
      )}

      {task.coach_feedback && (
        <div className="mb-4 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
          <p className="text-xs font-semibold text-indigo-300/90 uppercase tracking-wider mb-2">
            Coach Feedback
          </p>
          <p className="text-sm text-slate-200 leading-relaxed">
            {task.coach_feedback}
          </p>
        </div>
      )}

      {task.priority !== null && task.priority > 0 && (
        <div className="text-xs text-slate-500">
          Priority: {task.priority}
        </div>
      )}
    </div>
  );
}

export function GuidanceTasksSection({
  userId,
  coachId,
}: GuidanceTasksSectionProps) {
  const { isCoach, loading: coachLoading } = useCoachRole();
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [editingTask, setEditingTask] = useState<CoachTask | null>(null);

  // Check URL params for tab
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "completed") {
        setActiveTab("completed");
      }
    }
  }, []);

  const { data: tasks = [], mutate } = useSWR(
    coachId ? ["guidance-tasks", userId, coachId] : null,
    () => (coachId ? fetchClientGuidanceTasks(userId, coachId) : []),
    {
      revalidateOnFocus: true,
    }
  );

  const activeTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.status === "pending" || t.status === "active"
      ),
    [tasks]
  );

  const completedTasks = useMemo(
    () => tasks.filter((t) => t.status === "completed"),
    [tasks]
  );

  const listTasks = activeTab === "active" ? activeTasks : completedTasks;

  const handleSubtaskToggle = async (taskId: string, index: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const completedSubtasks = task.completed_subtasks || [];
    const newCompleted = completedSubtasks.includes(index)
      ? completedSubtasks.filter((i) => i !== index)
      : [...completedSubtasks, index];

    // Optimistic update
    mutate(
      tasks.map((t) =>
        t.id === taskId
          ? { ...t, completed_subtasks: newCompleted }
          : t
      ),
      false
    );

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("coach_tasks")
      .update({ completed_subtasks: newCompleted })
      .eq("id", taskId);

    if (error) {
      console.error("Error updating subtask:", error);
      mutate(); // Revalidate on error
    } else {
      mutate(); // Revalidate to ensure consistency
    }
  };

  const handleTaskCreated = () => {
    mutate();
  };

  const handleTaskUpdated = () => {
    mutate();
  };

  if (coachLoading) {
    return (
      <div className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6 text-sm text-slate-100 shadow-xl shadow-amber-500/10">
        Loading...
      </div>
    );
  }

  if (!isCoach) {
    return (
      <div className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6 text-sm text-slate-100 shadow-xl shadow-amber-500/10">
        <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
          Coach access required
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-50">
          You&apos;re signed in, but not as a coach.
        </h2>
        <p className="mt-2 text-sm text-slate-300/90">
          This console is reserved for Betrora coaches.
        </p>
      </div>
    );
  }

  if (!coachId) {
    return (
      <div className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6 text-sm text-slate-100 shadow-xl shadow-amber-500/10">
        <p className="text-sm text-slate-300/90">
          Unable to load coach information.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
            Guidance Tasks
          </p>
          <h2 className="text-xl font-semibold text-slate-50">
            Client Guidance Management
          </h2>
          <p className="text-sm text-slate-300/90">
            Create and manage guidance tasks for this client. Track progress,
            provide feedback, and help them stay on track.
          </p>
        </div>
      </section>

      <GuidanceTaskCreate
        userId={userId}
        coachId={coachId}
        onTaskCreated={handleTaskCreated}
      />

      <div className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/50">
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => setActiveTab("active")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "active"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            Active ({activeTasks.length})
          </button>
          <button
            onClick={() => setActiveTab("completed")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "completed"
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            Completed ({completedTasks.length})
          </button>
        </div>

        {listTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center opacity-60">
            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 grid place-items-center mb-3 text-slate-500 backdrop-blur-sm">
              {activeTab === "active" ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
            </div>
            <p className="text-slate-400 text-sm font-medium">
              No {activeTab} tasks
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {listTasks.map((task) => (
              <GuidanceTaskItem
                key={task.id}
                task={task}
                onEdit={() => setEditingTask(task)}
                onSubtaskToggle={handleSubtaskToggle}
                onFeedbackSubmit={handleTaskUpdated}
              />
            ))}
          </div>
        )}
      </div>

      {editingTask && (
        <GuidanceTaskEdit
          task={editingTask}
          onTaskUpdated={handleTaskUpdated}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
