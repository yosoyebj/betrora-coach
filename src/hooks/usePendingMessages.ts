import { useEffect, useState } from "react";
import useSWR from "swr";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";

async function fetchPendingChatCount(): Promise<number> {
  const supabase = createSupabaseBrowserClient();
  
  // Get Supabase Auth user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  // Get coach record by user_id
  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!coach) return 0;

  const coachId = coach.id;

  // Count distinct chats (user_id + coach_id combinations) that have at least one NEW unread message
  // A chat is a conversation between a user and a coach
  // We count unique chats, not individual messages
  // Only count chats with status = 'pending' (unread/new messages)
  // If a chat is opened and marked as read, it won't be counted
  const { data, error } = await supabase
    .from("coach_messages")
    .select("user_id, coach_id")
    .eq("coach_id", coachId)
    .eq("status", "pending"); // Only count NEW unread messages

  if (error) {
    console.error("❌ Error fetching pending chats count:", error);
    return 0;
  }

  if (!data || data.length === 0) {
    console.log("✅ No unread chats found");
    return 0;
  }

  // Count unique chat combinations (user_id + coach_id pairs)
  // Each unique combination represents one chat/conversation with new unread messages
  const uniqueChats = new Set(
    data.map((msg) => `${msg.user_id}-${msg.coach_id}`)
  );

  const count = uniqueChats.size;
  console.log("📊 Unread chats count:", count, "chats with new messages");
  return count;
}

export function usePendingMessages() {
  const { data: count = 0, mutate } = useSWR(
    "pending-chats-count",
    fetchPendingChatCount,
    {
      refreshInterval: 5000, // Poll every 5 seconds for real-time updates
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      // Dedupe interval to prevent multiple simultaneous requests
      dedupingInterval: 2000,
    }
  );

  // Enhanced refresh function that forces immediate revalidation
  const refresh = async () => {
    // Force immediate revalidation by calling mutate without arguments
    // This will trigger a fresh fetch from the database
    await mutate();
  };

  return { pendingCount: count, refresh };
}
