"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabaseClient";
import { logDebugEvent } from "../../lib/debugLogger";
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for magic link callback using getSessionFromUrl (more robust)
  const [processingMagicLink, setProcessingMagicLink] = useState(true);

  // Handle magic link callback using getSessionFromUrl
  useEffect(() => {
    if (typeof window === "undefined") {
      setProcessingMagicLink(false);
      return;
    }

    const handleMagicLink = async () => {
      // #region agent log
      logDebugEvent({
        location: "login/page.tsx:22",
        message: "handleMagicLink started",
        data: {
          hash: window.location.hash.substring(0, 100),
          search: window.location.search.substring(0, 100),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run3",
        hypothesisId: "A,F",
      });
      // #endregion
      
      try {
        const supabase = createSupabaseBrowserClient();
        
        // Read impersonation params from query string (middleware needs them there)
        const searchParams = new URLSearchParams(window.location.search);
        const impersonationId = searchParams.get("impersonation_id");
        const targetType = searchParams.get("target_type");
        const tokenHash = searchParams.get("token_hash") || searchParams.get("token");
        const tokenType = searchParams.get("type") || "magiclink";
        
        let data: any = null;
        let sessionError: any = null;

        if (tokenHash) {
          const result = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: tokenType as "magiclink",
          });
          data = result.data;
          sessionError = result.error;

          // Clean up token params, keep impersonation params for the hook
          const url = new URL(window.location.href);
          url.searchParams.delete("token_hash");
          url.searchParams.delete("token");
          url.searchParams.delete("type");
          window.history.replaceState({}, "", url.toString());
        } else {
          // Use getSessionFromUrl - more robust than manually parsing hash
          // This handles both hash fragments and code exchange automatically
          const result = await supabase.auth.getSessionFromUrl({
            storeSession: true,
          });
          data = result.data;
          sessionError = result.error;
        }

      // #region agent log
      logDebugEvent({
        location: "login/page.tsx:40",
        message: "getSessionFromUrl result",
        data: {
          hasSession: !!data?.session,
          hasUser: !!data?.session?.user,
          hasError: !!sessionError,
          errorMessage: sessionError?.message,
          userId: data?.session?.user?.id,
          impersonationId,
          targetType,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run3",
        hypothesisId: "B",
      });
      // #endregion

      if (sessionError || !data?.session) {
        // Not a magic link or session creation failed
        // #region agent log
        logDebugEvent({
          location: "login/page.tsx:45",
          message: "No session from URL",
          data: {
            hasError: !!sessionError,
            errorMessage: sessionError?.message,
          },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "run3",
          hypothesisId: "A,B",
        });
        // #endregion
        setProcessingMagicLink(false);
        // Clean up URL params if there was an error
        if (sessionError) {
          console.error("Error getting session from URL:", sessionError);
          setError("Failed to sign in with magic link. Please try again.");
          const url = new URL(window.location.href);
          url.search = "";
          url.hash = "";
          window.history.replaceState({}, "", url.toString());
        }
        return;
      }

      // Successfully got session from URL
      if (data.session?.user) {
            // #region agent log
            logDebugEvent({
              location: "login/page.tsx:55",
              message: "Checking coach status",
              data: {
                userId: data.session.user.id,
                impersonationId,
                targetType,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run3",
              hypothesisId: "C",
            });
            // #endregion
            // Verify the user is a coach (or has impersonation context for coach)
            const { data: coach, error: coachError } = await supabase
              .from("coaches")
              .select("id, status")
              .eq("user_id", data.session.user.id)
              .maybeSingle();

            // #region agent log
            logDebugEvent({
              location: "login/page.tsx:59",
              message: "Coach check result",
              data: {
                hasCoach: !!coach,
                coachStatus: coach?.status,
                hasError: !!coachError,
                errorMessage: coachError?.message,
                impersonationId,
                targetType,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "C",
            });
            // #endregion

            if (coachError || !coach) {
              // Check if this is an impersonation session (use values already extracted from currentHashParams)
              // #region agent log
              logDebugEvent({
                location: "login/page.tsx:99",
                message: "Checking impersonation fallback",
                data: {
                  impersonationId,
                  targetType,
                  targetTypeIsCoach: targetType === "coach",
                },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run2",
                hypothesisId: "C",
              });
              // #endregion

              if (impersonationId && targetType === "coach") {
                // Impersonation session - allow it (middleware will handle validation)
                // Clean up URL - remove auth hash but keep impersonation query params
                const url = new URL(window.location.href);
                url.hash = ""; // Remove auth tokens from hash (they're now in session)
                // Keep impersonation params in query string for the hook
                window.history.replaceState({}, "", url.toString());
                
                // #region agent log
                logDebugEvent({
                  location: "login/page.tsx:73",
                  message: "Impersonation allowed, calling router.replace",
                  data: { path: "/dashboard" },
                  timestamp: Date.now(),
                  sessionId: "debug-session",
                  runId: "run3",
                  hypothesisId: "C,D",
                });
                // #endregion
                // Redirect to dashboard - middleware will allow impersonation
                router.replace("/dashboard");
                return;
              }

              // Not a coach and not impersonation - sign out
              await supabase.auth.signOut();
              setError(
                "This account is not registered as a coach. Please contact admin to grant coach access."
              );
              setProcessingMagicLink(false);
              // Clean up hash params
              const url = new URL(window.location.href);
              url.hash = "";
              window.history.replaceState({}, "", url.toString());
              return;
            }

            if (coach.status && coach.status !== "active") {
              await supabase.auth.signOut();
              setError("Your coach account is currently inactive. Please contact support.");
              setProcessingMagicLink(false);
              // Clean up hash params
              const url = new URL(window.location.href);
              url.hash = "";
              window.history.replaceState({}, "", url.toString());
              return;
            }

            // Successfully signed in - clean up URL
            const url = new URL(window.location.href);
            url.hash = ""; // Remove auth tokens from hash (they're now in session)
            // Keep impersonation query params for the hook if they exist
            window.history.replaceState({}, "", url.toString());

            // #region agent log
            logDebugEvent({
              location: "login/page.tsx:113",
              message: "Regular coach signin, calling router.replace",
              data: { path: "/dashboard" },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run3",
              hypothesisId: "D",
            });
            // #endregion
            // Redirect to dashboard
            router.replace("/dashboard");
          }
        } catch (err) {
          // #region agent log
          logDebugEvent({
            location: "login/page.tsx:118",
            message: "Error in handleMagicLink catch block",
            data: {
              errorMessage: err instanceof Error ? err.message : String(err),
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run3",
            hypothesisId: "B",
          });
          // #endregion
          console.error("Error processing magic link:", err);
          setError("An error occurred while signing in. Please try again.");
          setProcessingMagicLink(false);
          // Clean up URL params
          const url = new URL(window.location.href);
          url.search = "";
          url.hash = "";
          window.history.replaceState({}, "", url.toString());
        }
    };

    handleMagicLink();
  }, [router]);

  // #region agent log
  useEffect(() => {
    logDebugEvent({
      location: "login/page.tsx:140",
      message: "Render check",
      data: { loading, processingMagicLink, hasUser: !!user },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "E",
    });
  }, [loading, processingMagicLink, user]);
  // #endregion

  if (!loading && !processingMagicLink && user) {
    // #region agent log
    logDebugEvent({
      location: "login/page.tsx:145",
      message: "Conditional redirect triggered",
      data: {},
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "D,E",
    });
    // #endregion
    router.replace("/dashboard");
  }

  const handleEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }

    // Ensure this account is registered as a coach
    const user = authData.user;
    if (!user) {
      setError("Authentication failed. Please try again.");
      return;
    }

    const { data: coach, error: coachError } = await supabase
      .from("coaches")
      .select("id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (coachError || !coach) {
      // Not a coach – sign out and show message
      await supabase.auth.signOut();
      setError(
        "This account is not registered as a coach. Please contact admin to grant coach access."
      );
      return;
    }

    if (coach.status && coach.status !== "active") {
      await supabase.auth.signOut();
      setError(
        "Your coach account is currently inactive. Please contact support."
      );
      return;
    }

    router.replace("/dashboard");
  };

  // Show loading state while processing magic link
  if (processingMagicLink || loading) {
    return (
      <div className="relative flex h-screen items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
        <div className="cinematic-grid" />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_-10%,_rgba(248,181,32,0.24),_transparent_60%)]" />
        <div className="relative glass-panel w-full max-w-md overflow-hidden rounded-3xl p-6 sm:p-8">
          <div className="relative mb-8 space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/90">
              Betrora
            </p>
            <h1 className="text-2xl font-semibold text-slate-50 sm:text-3xl">
              Signing you in...
            </h1>
            <p className="text-sm text-slate-300/80">
              Please wait while we sign you in.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
