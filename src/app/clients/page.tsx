"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { CinematicShell } from "../../components/CinematicShell";
import { useSupabaseAuth, useCoachRole } from "../../hooks/useSupabaseAuth";
import { createSupabaseBrowserClient } from "../../lib/supabaseClient";

type ClientWithMetadata = {
  id: string;
  full_name: string | null;
  email: string | null;
  lastActivity: string | null;
  lastMessagePreview: string | null;
  pendingCount: number;
  status: "needs_reply" | "active" | "quiet" | "new";
};

type CoachSubscription = {
  user_id: string;
  created_at: string | null;
};

type CoachMessageRow = {
  user_id: string;
  message: string | null;
  coach_response: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
};

type ClientProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

async function fetchClients(): Promise<ClientWithMetadata[]> {
  const supabase = createSupabaseBrowserClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: coach } = await supabase
    .from("coaches")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!coach) return [];

  const coachId = coach.id;

  // Get active subscriptions
  const { data: subscriptions, error: subError } = await supabase
    .from("coach_subscriptions")
    .select("user_id, created_at")
    .eq("coach_id", coachId)
    .eq("status", "active");

  const subscriptionRows = (subscriptions ?? []) as CoachSubscription[];

  if (subError || subscriptionRows.length === 0) {
    return [];
  }

  const clientIds = subscriptionRows.map((s) => s.user_id);
  const subscriptionMap = new Map(
    subscriptionRows.map((s) => [s.user_id, s.created_at])
  );

  // Get client profiles
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, full_name, email")
    .in("id", clientIds);

  if (usersError || !users) return [];

  // Get all messages for these clients
  const { data: messages, error: messagesError } = await supabase
    .from("coach_messages")
    .select("user_id, message, coach_response, status, created_at, updated_at")
    .eq("coach_id", coachId)
    .in("user_id", clientIds)
    .order("created_at", { ascending: false });

  if (messagesError) {
    console.error("Error fetching messages:", messagesError);
  }

  const messageRows = (messages ?? []) as CoachMessageRow[];

  // Process messages per client
  const messageMap = new Map<string, CoachMessageRow[]>();
  const pendingCountMap = new Map<string, number>();

  messageRows.forEach((msg) => {
    const userId = msg.user_id;
    if (!messageMap.has(userId)) {
      messageMap.set(userId, []);
      pendingCountMap.set(userId, 0);
    }
    messageMap.get(userId)!.push(msg);
    if (msg.status === "pending") {
      pendingCountMap.set(userId, (pendingCountMap.get(userId) || 0) + 1);
    }
  });

  const userRows = (users ?? []) as ClientProfileRow[];

  // Build normalized client array
  const clients: ClientWithMetadata[] = userRows.map((user) => {
    const userMessages = messageMap.get(user.id) || [];
    const pendingCount = pendingCountMap.get(user.id) || 0;

    // Find last activity (most recent message or subscription date)
    const lastMessage = userMessages[0];
    const subscriptionDate = subscriptionMap.get(user.id);
    let lastActivity: string | null = subscriptionDate || null;
    let lastMessagePreview: string | null = null;

    if (lastMessage) {
      const activityTime = lastMessage.updated_at || lastMessage.created_at;
      if (!lastActivity || activityTime > lastActivity) {
        lastActivity = activityTime;
      }
      const previewText = lastMessage.coach_response || lastMessage.message;
      lastMessagePreview =
        previewText && previewText.length > 60
          ? previewText.substring(0, 60) + "..."
          : previewText || null;
    }

    // Determine status
    let status: ClientWithMetadata["status"] = "active";
    const daysSinceActivity = lastActivity
      ? (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;
    const daysSinceSubscription = subscriptionDate
      ? (Date.now() - new Date(subscriptionDate).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (pendingCount > 0) {
      status = "needs_reply";
    } else if (daysSinceSubscription < 7) {
      status = "new";
    } else if (daysSinceActivity > 14) {
      status = "quiet";
    }

    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      lastActivity,
      lastMessagePreview,
      pendingCount,
      status,
    };
  });

  // Sort by pending first, then by last activity
  return clients.sort((a, b) => {
    if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
    if (a.pendingCount === 0 && b.pendingCount > 0) return 1;
    if (a.lastActivity && b.lastActivity) {
      return b.lastActivity.localeCompare(a.lastActivity);
    }
    if (a.lastActivity) return -1;
    if (b.lastActivity) return 1;
    return 0;
  });
}

function getInitials(name: string | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return "No activity";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)}w ago`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

type FilterType = "all" | "needs_reply" | "quiet" | "active" | "new";
type SortType = "last_activity" | "name" | "pending_replies";

export default function ClientsPage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const { isCoach, loading: coachLoading } = useCoachRole();
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<SortType>("last_activity");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const { data: clients = [], error, isLoading } = useSWR("clients-list", fetchClients, {
    revalidateOnFocus: true,
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  // Filter and sort clients
  const filteredAndSortedClients = useMemo(() => {
    let result = [...clients];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.full_name?.toLowerCase().includes(term) ||
          c.email?.toLowerCase().includes(term)
      );
    }

    // Apply status filter
    if (filter !== "all") {
      result = result.filter((c) => c.status === filter);
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "pending_replies":
          return b.pendingCount - a.pendingCount;
        case "name":
          const nameA = a.full_name || a.email || "";
          const nameB = b.full_name || b.email || "";
          return nameA.localeCompare(nameB);
        case "last_activity":
        default:
          if (a.lastActivity && b.lastActivity) {
            return b.lastActivity.localeCompare(a.lastActivity);
          }
          if (a.lastActivity) return -1;
          if (b.lastActivity) return 1;
          return 0;
      }
    });

    return result;
  }, [clients, searchTerm, filter, sortBy]);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  // Calculate stats
  const stats = useMemo(() => {
    const active = clients.filter((c) => c.status === "active").length;
    const needsReply = clients.filter((c) => c.status === "needs_reply").length;
    const quiet = clients.filter((c) => c.status === "quiet").length;
    return { active, needsReply, quiet, total: clients.length };
  }, [clients]);

  if (!loading && !user) {
    router.replace("/login");
    return null;
  }

  if (!coachLoading && !isCoach) {
    return (
      <CinematicShell>
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-800/80 bg-slate-950/80 p-6 text-sm text-slate-100 shadow-xl shadow-amber-500/10">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
            Coach access required
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-50">
            You&apos;re signed in, but not as a coach.
          </h1>
        </div>
      </CinematicShell>
    );
  }

  return (
    <CinematicShell>
      <div className="space-y-5">
        {/* Hero/Header */}
        <section className="flex flex-col gap-4 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-5 shadow-2xl shadow-amber-500/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-300/90">
              Clients
            </p>
            <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
              Stay close to client momentum
            </h1>
            <p className="text-sm text-slate-300/90">
              Track who needs attention, spot quiet clients, and keep conversations
              flowing—all in one calm view.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col">
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-center backdrop-blur-sm">
              <p className="text-lg font-semibold text-slate-50">{stats.total}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">
                Active
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-center backdrop-blur-sm">
              <p className="text-lg font-semibold text-amber-300">{stats.needsReply}</p>
              <p className="text-[10px] uppercase tracking-wider text-amber-400/80">
                Pending
              </p>
            </div>
            <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 px-3 py-2 text-center backdrop-blur-sm">
              <p className="text-lg font-semibold text-slate-400">{stats.quiet}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Quiet
              </p>
            </div>
          </div>
        </section>

        {/* Controls Row */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-slate-500"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="focus-outline w-full rounded-xl border border-slate-800/80 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 shadow-lg shadow-amber-500/10 backdrop-blur-sm focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "needs_reply", "quiet", "active", "new"] as FilterType[]).map(
              (f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`focus-outline rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                    filter === f
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/50"
                      : "border border-slate-800/80 bg-slate-900/60 text-slate-300 hover:bg-slate-800/80 hover:text-slate-50"
                  }`}
                >
                  {f === "needs_reply" ? "Needs reply" : f}
                </button>
              )
            )}

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
              className="focus-outline rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-300 shadow-lg shadow-amber-500/10 backdrop-blur-sm focus:border-amber-500/50"
            >
              <option value="last_activity">Last activity</option>
              <option value="name">Name</option>
              <option value="pending_replies">Pending replies</option>
            </select>
          </div>
        </section>

        {/* Error State */}
        {error && (
          <div className="rounded-xl border border-rose-500/50 bg-rose-950/30 p-4 text-sm text-rose-200/90">
            <p className="font-medium">Error loading clients</p>
            <p className="text-xs text-rose-300/70 mt-1">
              {error instanceof Error ? error.message : "Please try again"}
            </p>
          </div>
        )}

        {/* Main Content */}
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          {/* Client List */}
          <div className="space-y-3">
            {isLoading ? (
              // Loading skeletons
              <>
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-slate-800/60" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 rounded bg-slate-800/60" />
                        <div className="h-3 w-48 rounded bg-slate-800/40" />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : filteredAndSortedClients.length === 0 ? (
              // Empty state
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/60 p-12 text-center">
                <div className="mb-4 h-16 w-16 rounded-full bg-slate-800/60 flex items-center justify-center">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-slate-500"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-300">
                  {searchTerm || filter !== "all"
                    ? "No clients match your filters"
                    : "No active clients yet"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {searchTerm || filter !== "all"
                    ? "Try adjusting your search or filters"
                    : "Clients will appear here once they subscribe"}
                </p>
              </div>
            ) : (
              // Client cards
              filteredAndSortedClients.map((client, index) => {
                const initials = getInitials(client.full_name);
                const isSelected = selectedClientId === client.id;
                const hasPending = client.pendingCount > 0;

                return (
                  <div
                    key={client.id}
                    className={`group cursor-pointer rounded-2xl border transition-all ${
                      isSelected
                        ? "border-amber-500/60 bg-amber-950/20 shadow-lg shadow-amber-500/20"
                        : "border-slate-800/80 bg-slate-950/80 hover:border-slate-700/80 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-amber-500/10"
                    } ${hasPending ? "animate-pulse-slow" : ""}`}
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-sm font-semibold text-white shadow-lg ring-2 ring-slate-800/50">
                            {initials}
                          </div>
                          {hasPending && (
                            <div className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-amber-500 ring-2 ring-slate-950 animate-pulse" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-slate-50 truncate">
                                  {client.full_name || "Unknown Client"}
                                </p>
                                {client.status === "new" && (
                                  <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 border border-emerald-500/30">
                                    New
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 truncate mt-0.5">
                                {client.email}
                              </p>
                            </div>
                            {hasPending && (
                              <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-1 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                                {client.pendingCount}
                              </span>
                            )}
                          </div>

                          {client.lastMessagePreview && (
                            <p className="text-xs text-slate-400/90 mt-2 line-clamp-1">
                              {client.lastMessagePreview}
                            </p>
                          )}

                          <div className="flex items-center gap-2 mt-2">
                            <span
                              className={`text-[10px] font-medium ${
                                client.status === "needs_reply"
                                  ? "text-amber-400"
                                  : client.status === "quiet"
                                  ? "text-slate-500"
                                  : "text-slate-400"
                              }`}
                            >
                              {formatTimestamp(client.lastActivity)}
                            </span>
                            {client.status === "needs_reply" && (
                              <span className="text-[10px] uppercase tracking-wider text-amber-400/80">
                                • Needs reply
                              </span>
                            )}
                            {client.status === "quiet" && (
                              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                                • Quiet
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Client Focus Panel */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            {selectedClient ? (
              <div className="rounded-2xl border-l-4 border-amber-500/80 border border-slate-800/80 bg-gradient-to-br from-amber-950/40 via-slate-950/80 to-slate-950/80 p-5 shadow-xl shadow-amber-500/10">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.26em] text-amber-300/90 font-semibold">
                      Client Focus
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-50">
                      {selectedClient.full_name || "Unknown Client"}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">{selectedClient.email}</p>
                  </div>

                  <div className="space-y-2 rounded-xl bg-slate-900/60 p-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Last activity</span>
                      <span className="text-slate-200 font-medium">
                        {formatTimestamp(selectedClient.lastActivity)}
                      </span>
                    </div>
                    {selectedClient.pendingCount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Pending messages</span>
                        <span className="text-amber-300 font-medium">
                          {selectedClient.pendingCount}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Link
                      href={`/clients/${selectedClient.id}`}
                      className="focus-outline flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 px-4 py-2.5 text-xs font-medium text-slate-200 transition-all hover:bg-slate-800/80 hover:text-amber-100"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <path d="M20 8v6" />
                        <path d="M23 11h-6" />
                      </svg>
                      Open profile
                    </Link>
                    <Link
                      href="/inbox"
                      className="focus-outline flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs font-medium text-amber-200 transition-all hover:bg-amber-500/20 hover:text-amber-100"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      Open inbox
                    </Link>
                    <Link
                      href={`/clients/${selectedClient.id}#guidance`}
                      className="focus-outline flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/60 px-4 py-2.5 text-xs font-medium text-slate-200 transition-all hover:bg-slate-800/80 hover:text-amber-100"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                      Add guidance task
                    </Link>
                  </div>

                  <div className="pt-2 border-t border-slate-800/50">
                    <p className="text-[10px] text-slate-500 italic">
                      Private coach context available
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/60 p-8 text-center">
                <div className="mb-3 h-12 w-12 rounded-full bg-slate-800/60 flex items-center justify-center">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-slate-500"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-300">Select a client</p>
                <p className="text-xs text-slate-500 mt-1">
                  Choose a client from the list to see quick actions and details
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </CinematicShell>
  );
}
