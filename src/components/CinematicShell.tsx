"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSupabaseAuth } from "../hooks/useSupabaseAuth";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inbox", label: "Inbox" },
  { href: "/clients", label: "Clients" },
  { href: "/progress", label: "Progress" },
  { href: "/profile", label: "Profile" },
];

export function CinematicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();

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
                  : pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`focus-outline rounded-full px-3 py-1.5 transition-all ${
                    active
                      ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/50"
                      : "text-slate-300/80 hover:bg-slate-800/80 hover:text-slate-50"
                  }`}
                >
                  {item.label}
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

      <main className="mx-auto flex max-w-6xl flex-1 flex-col gap-4 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

