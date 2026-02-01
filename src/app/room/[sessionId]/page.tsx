'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { useToast } from '@/components/Toast';
import RoomLayout from './components/RoomLayout';
import { logDebugEvent } from '@/lib/debugLogger';

type Session = {
  id: string;
  user_id: string;
  coach_id: string;
  scheduled_at: string;
  duration_minutes: number;
  timezone: string | null;
  status: string;
  coach?: {
    id: string;
    user_id: string | null;
    full_name: string | null;
    email: string | null;
  };
  user?: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user, session: authSession, loading: authLoading } = useSupabaseAuth();
  const { showToast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionId = params?.sessionId as string;

  useEffect(() => {
    // #region agent log
    logDebugEvent({
      location: "betrora-coach/page.tsx:40",
      message: "Page mount - auth state",
      data: {
        currentUserId: user?.id,
        hasUser: !!user,
        authLoading,
        hasToken: !!authSession?.access_token,
        sessionId,
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "A",
    });
    // #endregion
    
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (!authSession?.access_token || !sessionId) return;

    const loadSession = async () => {
      try {
        // Fetch session from coach-sessions API
        const res = await fetch(`/api/coach-sessions?id=${sessionId}`, {
          headers: {
            Authorization: `Bearer ${authSession.access_token}`,
          },
        });

        if (!res.ok) {
          if (res.status === 404) {
            setError('Session not found or you do not have access');
            showToast('Session not found or you do not have access', 'error');
            setTimeout(() => router.push('/sessions'), 2000);
          } else if (res.status === 403) {
            setError('You do not have access to this session');
            showToast('You do not have access to this session', 'error');
            setTimeout(() => router.push('/sessions'), 2000);
          } else {
            setError('Failed to load session');
          }
          setLoading(false);
          return;
        }

        const data = await res.json();
        const sessionData = data.session;
        
        // #region agent log
        logDebugEvent({
          location: "betrora-coach/page.tsx:73",
          message: "API session data received",
          data: {
            sessionId,
            sessionUserId: sessionData?.user_id,
            sessionCoachId: sessionData?.coach_id,
            sessionCoachUserId: sessionData?.coach?.user_id,
            currentUserId: user?.id,
            hasCoachData: !!sessionData?.coach,
          },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "run1",
          hypothesisId: "B,C",
        });
        // #endregion
        
        if (!sessionData) {
          setError('Session not found');
          showToast('Session not found', 'error');
          setTimeout(() => router.push('/sessions'), 2000);
          setLoading(false);
          return;
        }

        setSession(sessionData);
        setLoading(false);
      } catch (error: any) {
        console.error('Error loading session:', error);
        setError('Failed to load session');
        setLoading(false);
      }
    };

    loadSession();
  }, [authLoading, user, authSession, sessionId, router, showToast]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
          <p className="text-white/60">Loading session...</p>
        </div>
      </div>
    );
  }

  if (error || !session || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Error</h1>
          <p className="text-white/60 mb-6">{error || 'Session not found'}</p>
          <button
            onClick={() => router.push('/sessions')}
            className="px-4 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
          >
            Back to Sessions
          </button>
        </div>
      </div>
    );
  }

  return <RoomLayout session={session} currentUserId={user.id} />;
}
