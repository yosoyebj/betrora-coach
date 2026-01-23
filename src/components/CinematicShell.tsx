"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSupabaseAuth } from "../hooks/useSupabaseAuth";
import { usePendingMessages } from "../hooks/usePendingMessages";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inbox", label: "Inbox" },
  { href: "/clients", label: "Clients" },
  { href: "/sessions", label: "Sessions" },
  { href: "/progress", label: "Progress" },
  { href: "/profile", label: "Profile" },
];

export function CinematicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const { pendingCount } = usePendingMessages();

  const handleLogout = async () => {
    const { createSupabaseBrowserClient } = await import("../lib/supabaseClient");
    const supabase = createSupabaseBrowserClient();
    // Sign out from Supabase Auth
    await supabase.auth.signOut();
    // Remove coach session from localStorage
    localStorage.removeItem("coach_session");
    router.push("/login");
  };

  return (
    <div className="relative min-h-screen text-slate-50" suppressHydrationWarning>
      <div className="cinematic-grid" suppressHydrationWarning />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_-10%,_rgba(245,158,11,0.22),_transparent_60%)]" suppressHydrationWarning />

      <header className="sticky top-0 z-20 border-b border-slate-800/70 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-emerald-400 glow-ring" />
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">
                Betrora
              </p>
              <p className="text-sm font-medium text-slate-100">
                Coach Console
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-2 rounded-full border border-slate-800/70 bg-slate-900/60 px-1 py-1 text-xs font-medium text-slate-200 shadow-lg shadow-amber-500/10 sm:flex">
            {navItems.map((item) => {
              const active =
                item.href === "/clients"
                  ? pathname.startsWith("/clients")
                  : item.href === "/sessions"
                  ? pathname.startsWith("/sessions") || pathname.startsWith("/availability")
                  : pathname === item.href;
              const isInbox = item.href === "/inbox";
              const showBadge = isInbox && pendingCount > 0;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`focus-outline relative rounded-full px-3 py-1.5 transition-all ${
                    active
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/50"
                      : "text-slate-300/80 hover:bg-slate-800/80 hover:text-slate-50"
                  }`}
                >
                  {item.label}
                  {showBadge && (
                    <>
                      {/* Pulsing glow effect */}
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                        <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-amber-400/80" />
                        {/* Badge with count */}
                        <span className="relative z-10 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 px-1.5 text-[10px] font-black text-white shadow-[0_0_15px_rgba(251,191,36,0.8),inset_0_1px_0_rgba(255,255,255,0.3)] ring-2 ring-amber-300/50 animate-bounce-slow">
                          {pendingCount > 99 ? "99+" : pendingCount}
                        </span>
                      </span>
                    </>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {loading ? (
              <div className="h-7 w-20 animate-pulse rounded-full bg-slate-800/80" />
            ) : user ? (
              <>
                <div className="hidden text-right text-xs sm:block">
                  <p className="text-slate-200/90">
                    {user.user_metadata?.full_name ?? user.email}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">
                    Coach
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="focus-outline rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-lg shadow-amber-500/20 ring-1 ring-slate-700/80 hover:bg-slate-800/90 hover:text-amber-100"
                >
                  Log out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="focus-outline rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-lg shadow-amber-500/40 hover:bg-amber-400"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Sub-navigation for Sessions section */}
      {(pathname.startsWith("/sessions") || pathname.startsWith("/availability")) && (
        <div className="border-b border-slate-800/70 bg-slate-950/50 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 sm:px-6 lg:px-8">
            <Link
              href="/sessions"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pathname === "/sessions"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-slate-300/60 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              Sessions
            </Link>
            <Link
              href="/availability"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pathname === "/availability"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-slate-300/60 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              Availability
            </Link>
            <Link
              href="/sessions/live"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pathname === "/sessions/live"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-slate-300/60 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              Live
            </Link>
          </div>
        </div>
      )}

      <main className="mx-auto flex max-w-6xl flex-1 flex-col gap-4 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

