'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  RoomAudioRenderer,
  useDataChannel,
} from '@livekit/components-react';
import { ConnectionState as LKConnectionState } from 'livekit-client';
import { useRouter } from 'next/navigation';
import VideoArea from './VideoArea';
import Sidebar from './Sidebar';
import { useToast } from '@/components/Toast';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
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

interface Message {
  id: string;
  sender: 'local' | 'remote';
  text: string;
  timestamp: Date;
}

interface RoomLayoutProps {
  session: Session;
  currentUserId: string;
}

interface InnerRoomProps {
  session: Session;
  currentUserId: string;
  otherPersonName: string;
  isCoach: boolean;
  sessionDataError: string | null;
  onLeave: () => void;
  onRetry: () => void;
}

type DisplayState = 'connected' | 'connecting' | 'failed' | 'disconnected';

function mapLKState(lkState: LKConnectionState): DisplayState {
  switch (lkState) {
    case LKConnectionState.Connected:
      return 'connected';
    case LKConnectionState.Connecting:
    case LKConnectionState.Reconnecting:
      return 'connecting';
    default:
      return 'disconnected';
  }
}

function InnerRoom({
  session,
  currentUserId,
  otherPersonName,
  isCoach,
  sessionDataError,
  onLeave,
  onRetry,
}: InnerRoomProps) {
  const lkState = useConnectionState();
  const connectionState = mapLKState(lkState);
  const { isMicrophoneEnabled, isCameraEnabled, localParticipant } = useLocalParticipant();

  const [messages, setMessages] = useState<Message[]>([]);

  const handleChatMessage = useCallback((msg: { payload: Uint8Array; from?: { identity?: string } }) => {
    const text = new TextDecoder().decode(msg.payload);
    setMessages(prev => [
      ...prev,
      {
        id: `remote-${Date.now()}-${Math.random()}`,
        sender: 'remote' as const,
        text,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const { send } = useDataChannel('chat', handleChatMessage);

  const sendMessage = useCallback(
    (text: string) => {
      send(new TextEncoder().encode(text), { reliable: true });
      setMessages(prev => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          sender: 'local' as const,
          text,
          timestamp: new Date(),
        },
      ]);
    },
    [send],
  );

  const toggleMic = () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  const toggleCamera = () => localParticipant.setCameraEnabled(!isCameraEnabled);

  const getStatusColor = (state: DisplayState) => {
    switch (state) {
      case 'connected':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'connecting':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      case 'failed':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  const getStatusLabel = (state: DisplayState) => {
    switch (state) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'failed':
        return 'Failed – retry';
      default:
        return 'Disconnected';
    }
  };

  const [activeTab, setActiveTab] = useState<'chat' | 'tasks'>('chat');
  const sessionTitle = session.user?.full_name || session.user?.email || 'Session';

  return (
    <>
      {/* Error Banner */}
      {sessionDataError && (
        <div className="bg-red-500/20 border-b border-red-500/40 px-6 py-3 z-20">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-red-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-300 text-sm font-medium">{sessionDataError}</p>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-white">
            {sessionTitle} <span className="text-white/60 font-normal">Room</span>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusColor(connectionState)}`}>
            {connectionState === 'connecting' && (
              <div className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse" />
            )}
            <span>{getStatusLabel(connectionState)}</span>
          </div>

          {(connectionState === 'failed' || connectionState === 'disconnected') && (
            <button
              onClick={onRetry}
              className="px-4 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 transition-colors text-sm font-medium"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Area (Left) */}
        <div className="flex-1 relative bg-slate-950">
          <VideoArea otherPersonName={otherPersonName} />
        </div>

        {/* Sidebar (Right) */}
        <div className="w-80 bg-slate-900/60 backdrop-blur-md border-l border-white/10 flex flex-col h-full overflow-hidden">
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            session={session}
            currentUserId={currentUserId}
            sendMessage={sendMessage}
            messages={messages}
            isCoach={isCoach}
          />
        </div>
      </div>

      {/* Footer Controls */}
      <div className="h-20 bg-slate-900/80 backdrop-blur-md border-t border-white/10 flex items-center justify-center gap-4 z-10">
        <button
          onClick={toggleMic}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
            isMicrophoneEnabled
              ? 'bg-slate-700/50 text-white hover:bg-slate-700/70'
              : 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
          }`}
          title={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isMicrophoneEnabled ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            )}
          </svg>
        </button>

        <button
          onClick={toggleCamera}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
            isCameraEnabled
              ? 'bg-slate-700/50 text-white hover:bg-slate-700/70'
              : 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
          }`}
          title={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isCameraEnabled ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            )}
          </svg>
        </button>

        <button
          onClick={onLeave}
          className="w-14 h-14 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-all flex items-center justify-center"
          title="End call / Leave"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M7 11a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v2a4 4 0 01-4 4zm0 0v6a2 2 0 002 2h4a2 2 0 002-2v-6m-6 0h12" />
          </svg>
        </button>
      </div>

      {/* Renders audio for all remote participants automatically */}
      <RoomAudioRenderer />
    </>
  );
}

export default function RoomLayout({ session, currentUserId }: RoomLayoutProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { session: authSession, loading: authLoading } = useSupabaseAuth();

  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [roomKey, setRoomKey] = useState(0);

  const [isCoach, setIsCoach] = useState<boolean>(false);
  const [sessionDataError, setSessionDataError] = useState<string | null>(null);

  // Determine if current user is the coach
  useEffect(() => {
    const checkIfCoach = async () => {
      if (session.user_id === currentUserId) { setIsCoach(false); return; }
      if (!session.coach_id) { setIsCoach(false); return; }
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session: supabaseSession } } = await supabase.auth.getSession();
        if (!supabaseSession?.access_token) { setIsCoach(false); return; }
        const { data: coach, error } = await supabase
          .from('coaches')
          .select('user_id')
          .eq('id', session.coach_id)
          .single();
        setIsCoach(!error && !!coach && coach.user_id === currentUserId);
      } catch {
        setIsCoach(false);
      }
    };
    checkIfCoach();
  }, [session, currentUserId]);

  // Validate session data integrity
  useEffect(() => {
    logDebugEvent({
      location: 'betrora-coach/RoomLayout.tsx',
      message: 'session data',
      data: { currentUserId, sessionUserId: session.user_id, sessionCoachUserId: session.coach?.user_id },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'run1',
      hypothesisId: 'A,B,C,D',
    });

    if (session.user_id && session.coach?.user_id && session.user_id === session.coach.user_id) {
      setSessionDataError(
        'DATA ERROR: Session has the same user as both client and coach. Please create a new session with a different client user.',
      );
    } else {
      setSessionDataError(null);
    }
  }, [currentUserId, session]);

  // Fetch LiveKit token using Supabase session access token (only when auth is ready)
  const fetchToken = useCallback(async () => {
    const token = authSession?.access_token;
    if (!token) {
      setTokenError('Not authenticated');
      setTokenLoading(false);
      return;
    }
    setTokenLoading(true);
    setTokenError(null);
    try {
      const res = await fetch(`/api/livekit-token?sessionId=${encodeURIComponent(session.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Token fetch failed (${res.status})`);
      }
      const data = await res.json();
      setLivekitToken(data.token);
      setServerUrl(data.serverUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setTokenError(msg);
      showToast(`Room error: ${msg}`, 'error');
    } finally {
      setTokenLoading(false);
    }
  }, [session.id, authSession?.access_token, showToast]);

  useEffect(() => {
    if (authLoading) return;
    if (!authSession?.access_token) {
      setTokenError('Not authenticated');
      setTokenLoading(false);
      return;
    }
    fetchToken();
  }, [authLoading, authSession?.access_token, fetchToken]);

  const handleLeave = () => {
    router.push('/sessions');
  };

  const handleRetry = () => {
    setLivekitToken(null);
    setServerUrl(null);
    setRoomKey(k => k + 1);
    fetchToken();
  };

  const isUser = session.user_id === currentUserId;
  const otherPersonName = isUser
    ? (session.coach?.full_name || session.coach?.email || 'Coach')
    : (session.user?.full_name || session.user?.email || 'Client');

  if (authLoading || tokenLoading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Joining room...</p>
        </div>
      </div>
    );
  }

  if (tokenError || !livekitToken || !serverUrl) {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-300 mb-4">{tokenError || 'Failed to get room token'}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      key={roomKey}
      serverUrl={serverUrl}
      token={livekitToken}
      connect={true}
      audio={true}
      video={true}
      onDisconnected={handleLeave}
      className="fixed inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col"
    >
      <InnerRoom
        session={session}
        currentUserId={currentUserId}
        otherPersonName={otherPersonName}
        isCoach={isCoach}
        sessionDataError={sessionDataError}
        onLeave={handleLeave}
        onRetry={handleRetry}
      />
    </LiveKitRoom>
  );
}
