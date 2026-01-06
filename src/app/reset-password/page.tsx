"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabaseClient";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Supabase password reset redirects with tokens in URL hash
    // Check if we have the access token in the hash
    if (typeof window !== "undefined") {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get("access_token");
      const type = hashParams.get("type");
      
      if (type === "recovery" && accessToken) {
        // We have a valid reset token, user can proceed
        return;
      }
      
      // Also check query params (some Supabase configs use query params)
      const token = searchParams.get("token");
      const queryType = searchParams.get("type");
      
      if (queryType === "recovery" && token) {
        return;
      }
      
      // If no valid token found, show error
      if (!accessToken && !token) {
        setError("Invalid or missing reset token. Please request a new password reset from the login page.");
      }
    }
  }, [searchParams]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setSubmitting(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      setSubmitting(false);
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      
      // Supabase password reset includes tokens in URL hash after redirect
      // The session should already be established from the redirect
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Try to get tokens from URL hash
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        
        if (accessToken && refreshToken) {
          // Set the session from the tokens
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          
          if (sessionError) {
            setError("Invalid reset link. Please request a new password reset.");
            setSubmitting(false);
            return;
          }
        } else {
          setError("Invalid reset link. Please request a new password reset from the login page.");
          setSubmitting(false);
          return;
        }
      }

      // Update password - user must be authenticated via the reset link
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message);
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      console.error("Password reset error:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
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
            Reset your password
          </h1>
          <p className="text-sm text-slate-300/80">
            Enter your new password below. Make sure it&apos;s at least 6 characters long.
          </p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/60 px-3 py-2.5">
              <p className="text-xs text-emerald-300 font-medium">
                Password reset successful!
              </p>
              <p className="text-[11px] text-emerald-200/80 mt-1.5">
                Redirecting to login...
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleReset} className="relative space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-[0.22em] text-slate-300/80">
                New Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-50 shadow-inner shadow-black/40 placeholder:text-slate-500"
                placeholder="Enter new password"
                minLength={6}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-[0.22em] text-slate-300/80">
                Confirm Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="focus-outline w-full rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-50 shadow-inner shadow-black/40 placeholder:text-slate-500"
                placeholder="Confirm new password"
                minLength={6}
              />
            </div>

            {error && (
              <div className="rounded-xl bg-rose-950/40 border border-rose-800/60 px-3 py-2.5">
                <p className="text-xs text-rose-300 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="focus-outline flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/40 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Resetting..." : "Reset Password"}
            </button>

            <div className="text-center">
              <Link
                href="/login"
                className="text-[11px] text-amber-300 underline-offset-2 hover:underline"
              >
                Back to login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

