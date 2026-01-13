"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import useSWR from "swr";
import { fetchPendingFeedbackTasks, type PendingFeedbackTask } from "../lib/fetchPendingFeedback";

type PendingFeedbackNotificationProps = {
  coachId: string | null;
};

export function PendingFeedbackNotification({
  coachId,
}: PendingFeedbackNotificationProps) {
  const router = useRouter();
  const [pulseIntensity, setPulseIntensity] = useState(1);
  const [timeAgo, setTimeAgo] = useState<string>("");

  const { data: pendingTasks = [], mutate, error } = useSWR(
    coachId ? ["pending-feedback", coachId] : null,
    () => (coachId ? fetchPendingFeedbackTasks(coachId) : []),
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: true,
    }
  );

  // Debug logging
  useEffect(() => {
    if (coachId) {
      console.log("PendingFeedbackNotification - coachId:", coachId);
      console.log("PendingFeedbackNotification - pendingTasks:", pendingTasks);
      console.log("PendingFeedbackNotification - error:", error);
    }
  }, [coachId, pendingTasks, error]);

  // Calculate time ago for the most recent task
  useEffect(() => {
    if (pendingTasks.length > 0 && pendingTasks[0].completed_at) {
      const updateTimeAgo = () => {
        const completed = new Date(pendingTasks[0].completed_at!);
        const now = new Date();
        const diffMs = now.getTime() - completed.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) {
          setTimeAgo("just now");
        } else if (diffMins < 60) {
          setTimeAgo(`${diffMins} minute${diffMins > 1 ? "s" : ""} ago`);
        } else if (diffHours < 24) {
          setTimeAgo(`${diffHours} hour${diffHours > 1 ? "s" : ""} ago`);
        } else {
          setTimeAgo(`${diffDays} day${diffDays > 1 ? "s" : ""} ago`);
        }
      };

      updateTimeAgo();
      const interval = setInterval(updateTimeAgo, 60000); // Update every minute
      return () => clearInterval(interval);
    }
  }, [pendingTasks]);

  // Pulsing animation for urgency
  useEffect(() => {
    if (pendingTasks.length > 0) {
      const interval = setInterval(() => {
        setPulseIntensity((prev) => (prev === 1 ? 1.05 : 1));
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [pendingTasks.length]);

  if (!coachId || pendingTasks.length === 0) {
    return null;
  }

  // Group tasks by client
  const tasksByClient = pendingTasks.reduce((acc, task) => {
    const userId = task.user_id;
    if (!acc[userId]) {
      acc[userId] = {
        user: task.user,
        tasks: [],
      };
    }
    acc[userId].tasks.push(task);
    return acc;
  }, {} as Record<string, { user: PendingFeedbackTask["user"]; tasks: PendingFeedbackTask[] }>);

  const clients = Object.entries(tasksByClient);
  const totalTasks = pendingTasks.length;

  const handleClientClick = (userId: string) => {
    router.push(`/clients/${userId}?tab=completed`);
  };

  return (
    <div
      className="group relative overflow-hidden rounded-3xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-950/90 via-orange-950/80 to-amber-950/90 p-6 shadow-2xl shadow-amber-500/30 backdrop-blur-sm transition-all duration-500 hover:border-amber-400/60 hover:shadow-amber-500/50"
      style={{
        transform: `scale(${pulseIntensity})`,
        transition: "transform 2s ease-in-out",
      }}
    >
      {/* Animated background pulse */}
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 animate-pulse-slow opacity-60" />
      
      {/* Urgency indicator - pulsing ring */}
      <div className="absolute top-4 right-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-amber-400/40 animate-ping" />
          <div className="relative w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.8)]" />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          {/* Emotional icon with animation */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-pulse" />
              <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-amber-500/30 to-orange-500/30 border-2 border-amber-400/50 flex items-center justify-center backdrop-blur-sm">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-amber-300 animate-bounce-slow"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <path d="M13 8H8" />
                  <path d="M17 12H8" />
                  <path d="M17 16H8" />
                </svg>
              </div>
            </div>
          </div>

          {/* Header text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300/90 animate-pulse">
                Action Required
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-200 border border-amber-400/30">
                {totalTasks} task{totalTasks > 1 ? "s" : ""}
              </span>
            </div>
            
            <h3 className="text-lg font-bold text-white mb-1">
              {clients.length === 1
                ? `${clients[0][1].user?.full_name || "Client"} completed ${clients[0][1].tasks.length} task${clients[0][1].tasks.length > 1 ? "s" : ""}`
                : `${clients.length} clients need your feedback`}
            </h3>
            
            <p className="text-sm text-amber-100/80">
              Click on a client below to provide feedback on their completed tasks.
            </p>
          </div>
        </div>

        {/* Client list */}
        <div className="space-y-2">
          {clients.map(([userId, { user, tasks }]) => {
            const clientName = user?.full_name || "Client";
            const mostRecentTask = tasks[0];
            const taskText = mostRecentTask.task_text;
            
            // Calculate time for most recent task
            let taskTimeAgo = "";
            if (mostRecentTask.completed_at) {
              const completed = new Date(mostRecentTask.completed_at);
              const now = new Date();
              const diffMs = now.getTime() - completed.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffHours = Math.floor(diffMs / 3600000);
              
              if (diffMins < 1) {
                taskTimeAgo = "just now";
              } else if (diffMins < 60) {
                taskTimeAgo = `${diffMins}m ago`;
              } else {
                taskTimeAgo = `${diffHours}h ago`;
              }
            }

            return (
              <div
                key={userId}
                onClick={() => handleClientClick(userId)}
                className="group/client cursor-pointer rounded-xl border border-amber-500/30 bg-amber-950/40 p-4 hover:border-amber-400/50 hover:bg-amber-950/60 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-white group-hover/client:text-amber-100 transition-colors">
                        {clientName}
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-200 border border-amber-400/30">
                        {tasks.length} task{tasks.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="text-xs text-amber-100/70 line-clamp-1 mb-2">
                      &quot;{taskText}&quot;
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-amber-300/60">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>{taskTimeAgo}</span>
                    </div>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-amber-400 group-hover/client:translate-x-1 transition-transform flex-shrink-0 mt-1"
                  >
                    <path d="M5 12h14" />
                    <path d="M12 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Shimmer effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
    </div>
  );
}
