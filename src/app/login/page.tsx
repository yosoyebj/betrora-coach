"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabaseClient";
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) {
    router.replace("/dashboard");
  }

  const handleEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/dashboard");
  };

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
      <div className="cinematic-grid" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_-10%,_rgba(248,181,32,0.24),_transparent_60%)]" />

      <div className="relative glass-panel w-full max-w-md overflow-hidden rounded-3xl p-6 sm:p-8">
        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-amber-500/30 blur-3xl" />
        <div className="absolute -bottom-24 -left-10 h-40 w-40 rounded-full bg-emerald-400/25 blur-3xl" />

        <div className="relative mb-8 space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-300/90">
            Betrora
          </p>
          <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
            Coach console access
          </h1>
          <p className="text-sm text-slate-300/80">
            Sign in with your coaching account. If you&apos;re not yet a coach,
            request access and we&apos;ll be in touch.
          </p>
        </div>

        <form onSubmit={handleEmailPassword} className="relative space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-[0.22em] text-slate-300/80">
              Work email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-50 shadow-inner shadow-black/40 placeholder:text-slate-500"
              placeholder="coach@studio.com"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-[0.22em] text-slate-300/80">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-50 shadow-inner shadow-black/40 placeholder:text-slate-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="focus-outline flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/40 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/60 px-4 py-3 text-xs text-slate-300/90">
          <p className="font-medium text-amber-200/90">
            Not a coach on Betrora yet?
          </p>
          <p className="mt-1">
            This console is for approved coaches. Request access via your{" "}
            <Link
              href="https://betrora.com"
              className="text-amber-300 underline-offset-2 hover:underline"
            >
              Betrora account
            </Link>{" "}
            or contact support.
          </p>
        </div>
      </div>
    </div>
  );
}

