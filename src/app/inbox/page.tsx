"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { CinematicShell } from "../../components/CinematicShell";
import { useSupabaseAuth, useCoachRole } from "../../hooks/useSupabaseAuth";
import { createSupabaseBrowserClient } from "../../lib/supabaseClient";
import type { CoachMessage } from "../../lib/types";
import { MessageList } from "../../components/MessageList";
import { MessageDetail } from "../../components/MessageDetail";
import { CoachNotesPanel } from "../../components/CoachNotesPanel";
import { usePendingMessages } from "../../hooks/usePendingMessages";

async function fetchInbox(statusFilter: string | null) {
  const supabase = createSupabaseBrowserClient();
  
  // Get Supabase Auth user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Get coach record by user_id
  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!coach) return [];

  const coachId = coach.id;

  // Fetch messages directly from Supabase
  let query = supabase
    .from("coach_messages")
    .select("*")
    .eq("coach_id", coachId);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching inbox:", error);
    return [];
  }

  return (data || []) as CoachMessage[];
}

export default function InboxPage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const { isCoach, loading: coachLoading } = useCoachRole();
  const [statusFilter, setStatusFilter] = useState<string | null>("pending");
  const { data: messages = [], mutate } = useSWR(
    ["inbox", statusFilter],
    () => fetchInbox(statusFilter),
    {
      refreshInterval: 5000, // Poll every 5 seconds for real-time updates
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );
  const { pendingCount: realTimePendingCount, refresh: refreshPendingCount } = usePendingMessages();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [justReceivedNew, setJustReceivedNew] = useState(false);
  const [previousPendingCount, setPreviousPendingCount] = useState(0);

  if (!loading && !user) {
    router.replace("/login");
  }

  const selectedMessage = messages.find((m) => m.id === selectedId) ?? null;
  const pendingCount = messages.filter((m) => m.status === "pending").length;
  // Use the local count if it's more recent, otherwise use the real-time count
  // This ensures the count updates immediately when messages are marked as read
  const displayPendingCount = pendingCount > 0 ? pendingCount : realTimePendingCount;

  // Helper function to mark all messages in a chat as read
  // A chat is defined by user_id + coach_id combination
  const markChatAsRead = async (message: CoachMessage) => {
    const supabase = createSupabaseBrowserClient();
    
    console.log("📖 Marking chat as read:", message.user_id, message.coach_id);
    
    // Mark ALL pending messages in this chat (same user_id + coach_id) as read
    const { data, error } = await supabase
      .from("coach_messages")
      .update({ status: "read" })
      .eq("user_id", message.user_id)
      .eq("coach_id", message.coach_id)
      .eq("status", "pending")
      .select();

    if (error) {
      console.error("❌ Error marking chat as read:", error);
      return false;
    }

    console.log("✅ Chat marked as read successfully:", data?.length, "messages");
    
    // Optimistically update the local messages array immediately
    const updatedMessages = messages.map((m) =>
      m.user_id === message.user_id && 
      m.coach_id === message.coach_id && 
      m.status === "pending"
        ? { ...m, status: "read" as const }
        : m
    );
    mutate(updatedMessages, false); // Update cache immediately without revalidation
    
    // Small delay to ensure database update is committed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Force immediate revalidation of messages to sync with database
    mutate();
    
    // Force immediate refresh of pending chats count
    refreshPendingCount();
    
    return true;
  };

  // Helper function to mark all messages in a chat as unread (pending)
  // A chat is defined by user_id + coach_id combination
  const markChatAsUnread = async (message: CoachMessage) => {
    const supabase = createSupabaseBrowserClient();
    
    console.log("📬 Marking chat as unread:", message.user_id, message.coach_id);
    
    // Mark ALL read messages in this chat (same user_id + coach_id) as pending
    // Don't change "replied" status - only change "read" back to "pending"
    const { data, error } = await supabase
      .from("coach_messages")
      .update({ status: "pending" })
      .eq("user_id", message.user_id)
      .eq("coach_id", message.coach_id)
      .eq("status", "read")
      .select();

    if (error) {
      console.error("❌ Error marking chat as unread:", error);
      return false;
    }

    console.log("✅ Chat marked as unread successfully:", data?.length, "messages");
    
    // Optimistically update the local messages array immediately
    const updatedMessages = messages.map((m) =>
      m.user_id === message.user_id && 
      m.coach_id === message.coach_id && 
      m.status === "read"
        ? { ...m, status: "pending" as const }
        : m
    );
    mutate(updatedMessages, false); // Update cache immediately without revalidation
    
    // Small delay to ensure database update is committed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Force immediate revalidation of messages to sync with database
    mutate();
    
    // Force immediate refresh of pending chats count
    refreshPendingCount();
    
    return true;
  };

  // Detect when new messages arrive
  useEffect(() => {
    if (displayPendingCount > previousPendingCount && previousPendingCount > 0) {
      setJustReceivedNew(true);
      const timer = setTimeout(() => setJustReceivedNew(false), 4000);
      return () => clearTimeout(timer);
    }
    setPreviousPendingCount(displayPendingCount);
  }, [displayPendingCount, previousPendingCount]);

  // Refresh pending count when messages change or component mounts
  useEffect(() => {
    refreshPendingCount();
  }, [messages.length, refreshPendingCount]);

  // Also refresh on mount to ensure accurate count
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  const updateStatus = async (status: CoachMessage["status"]) => {
    if (!selectedMessage) return;
    
    // When marking as read, mark the entire chat (all messages with same user_id + coach_id)
    if (status === "read") {
      await markChatAsRead(selectedMessage);
      return;
    }
    
    // When marking as unread (pending), mark the entire chat back to pending
    if (status === "pending") {
      await markChatAsUnread(selectedMessage);
      return;
    }
    
    // For other statuses (e.g., "replied"), update just this message
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("coach_messages")
      .update({ status })
      .eq("id", selectedMessage.id);

    if (error) {
      console.error("Error updating message status:", error);
      return;
    }

    mutate();
  };

  const handleReplySent = () => {
    mutate();
  };

  return (
    <>
      <style jsx global>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes urgent-pulse {
          0%, 100% { 
            transform: scale(1);
            box-shadow: 0_0_0_0_rgba(251,191,36,0.7);
          }
          50% { 
            transform: scale(1.05);
            box-shadow: 0_0_0_20px_rgba(251,191,36,0);
          }
        }
        @keyframes heartbeat {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.1); }
          50% { transform: scale(1); }
          75% { transform: scale(1.05); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes glow-pulse {
          0%, 100% { 
            opacity: 0.6;
            filter: blur(20px);
          }
          50% { 
            opacity: 1;
            filter: blur(30px);
          }
        }
        @keyframes slide-in-bounce {
          0% { 
            transform: translateX(-100%) scale(0.8);
            opacity: 0;
          }
          60% { 
            transform: translateX(10px) scale(1.05);
            opacity: 1;
          }
          100% { 
            transform: translateX(0) scale(1);
            opacity: 1;
          }
        }
        .animate-urgent-pulse {
          animation: urgent-pulse 2s ease-in-out infinite;
        }
        .animate-heartbeat {
          animation: heartbeat 1.5s ease-in-out infinite;
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        .animate-glow-pulse {
          animation: glow-pulse 2s ease-in-out infinite;
        }
        .animate-slide-in-bounce {
          animation: slide-in-bounce 0.6s ease-out;
        }
      `}</style>
      <CinematicShell>
        {!coachLoading && !isCoach ? (
          <div className="mx-auto max-w-lg rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6 text-sm text-slate-100 shadow-xl shadow-amber-500/10">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
              Coach access required
            </p>
            <h1 className="mt-2 text-xl font-semibold text-slate-50">
              Inbox is only for approved coaches.
            </h1>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Enhanced Emotional Pending Chats Notification */}
            {displayPendingCount > 0 && (
              <div className={`relative overflow-hidden rounded-3xl border-2 ${
                justReceivedNew 
                  ? 'border-red-500/70 animate-slide-in-bounce' 
                  : 'border-amber-500/50'
              } bg-gradient-to-br from-amber-950/95 via-orange-950/90 to-red-950/90 p-6 shadow-[0_20px_60px_-15px_rgba(251,191,36,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-xl ${
                justReceivedNew ? 'animate-urgent-pulse' : 'animate-pulse-slow'
              }`}>
                {/* Multiple animated background glows for depth */}
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 animate-pulse opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-br from-amber-400/10 via-transparent to-orange-400/10 animate-glow-pulse" />
                
                {/* Shimmer effect */}
                <div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent" 
                  style={{
                    animation: 'shimmer 3s ease-in-out infinite'
                  }}
                />
              
                <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    {/* Enhanced animated badge */}
                    <div className="relative flex-shrink-0">
                      {/* Multiple pulsing rings for urgency */}
                      <div className="absolute inset-0 bg-amber-400/40 rounded-full blur-2xl animate-ping" style={{ animationDelay: '0s' }} />
                      <div className="absolute inset-0 bg-orange-400/30 rounded-full blur-xl animate-ping" style={{ animationDelay: '0.5s' }} />
                      <div className="absolute inset-0 bg-red-400/20 rounded-full blur-lg animate-ping" style={{ animationDelay: '1s' }} />
                      
                      {/* Main badge with heartbeat animation */}
                      <div className={`relative w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 flex items-center justify-center text-3xl font-black text-white shadow-[0_0_40px_rgba(251,191,36,0.9),inset_0_2px_4px_rgba(255,255,255,0.3)] ring-4 ring-amber-300/50 ${
                        justReceivedNew ? 'animate-heartbeat' : 'animate-bounce-slow'
                      }`}>
                        {displayPendingCount > 99 ? "99+" : displayPendingCount}
                      </div>
                      
                      {/* Floating sparkles */}
                      <div className="absolute -top-2 -right-2 w-3 h-3 bg-amber-300 rounded-full animate-float shadow-[0_0_10px_rgba(251,191,36,0.8)]" style={{ animationDelay: '0s' }} />
                      <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-orange-300 rounded-full animate-float shadow-[0_0_8px_rgba(251,146,60,0.8)]" style={{ animationDelay: '1s' }} />
                    </div>
                    
                    {/* Enhanced text content */}
                    <div className="flex-1">
                      <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-orange-100 to-amber-100 mb-2 flex items-center gap-3">
                        <span className={`inline-block text-3xl ${justReceivedNew ? 'animate-heartbeat' : 'animate-bounce'}`}>
                          {justReceivedNew ? '🚨' : '🔔'}
                        </span>
                        {displayPendingCount === 1 
                          ? "URGENT: New Chat Waiting!" 
                          : `URGENT: ${displayPendingCount} Chats Need Your Attention!`}
                      </h2>
                      <p className="text-base font-semibold text-amber-100/90 mb-1">
                        {displayPendingCount === 1 
                          ? "Your client is waiting for your response. Every moment counts!" 
                          : "Your clients are waiting for your responses. They're counting on you!"}
                      </p>
                      <p className="text-sm text-amber-200/70 italic">
                        {displayPendingCount === 1
                          ? "💬 Quick response builds trust and shows you care"
                          : "💬 Your timely responses make all the difference in their journey"}
                      </p>
                    </div>
                  </div>
                  
                  {/* Enhanced action badge */}
                  <div className="flex-shrink-0">
                    <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-amber-500/40 via-orange-500/40 to-red-500/40 border-2 border-amber-400/60 backdrop-blur-sm shadow-[0_0_20px_rgba(251,191,36,0.5)] ${
                      justReceivedNew ? 'animate-pulse' : ''
                    }`}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-amber-200 animate-pulse">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        <path d="M13 8H8" />
                        <path d="M17 12H8" />
                      </svg>
                      <span className="text-sm font-black text-white uppercase tracking-wider">ACTION REQUIRED</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-amber-200 animate-bounce">
                        <path d="M5 12h14" />
                        <path d="M12 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)]">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-amber-300/90">
                    Inbox
                  </p>
                  <h1 className="text-lg font-semibold text-slate-50">
                    Client chats
                  </h1>
                </div>
              <div className="flex gap-1 rounded-full border border-slate-800/80 bg-slate-950/70 p-1 text-[11px]">
                {["pending", "read", "replied"].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`focus-outline rounded-full px-3 py-1 capitalize transition ${
                      statusFilter === status
                        ? "bg-amber-500 text-slate-950"
                        : "bg-transparent text-slate-300 hover:bg-slate-800/80"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <MessageList
              messages={messages}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </section>
            <section className="space-y-4">
              <MessageDetail
                message={selectedMessage}
                onStatusChange={updateStatus}
                onReplySent={handleReplySent}
              />
              <CoachNotesPanel userId={selectedMessage?.user_id} />
            </section>
          </div>
          </div>
        )}
      </CinematicShell>
    </>
  );
}
