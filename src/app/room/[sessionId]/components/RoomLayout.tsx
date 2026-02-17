'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWebRTC, ConnectionState } from '../hooks/useWebRTC';
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

interface RoomLayoutProps {
  session: Session;
  currentUserId: string;
}

export default function RoomLayout({ session, currentUserId }: RoomLayoutProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'chat' | 'tasks'>('chat');
  const [isCoach, setIsCoach] = useState<boolean>(false);
  const [isEnablingMedia, setIsEnablingMedia] = useState(false);

  // Determine if current user is the coach
  useEffect(() => {
    const checkIfCoach = async () => {
      // If user is the session owner (user_id), they're not the coach
      if (session.user_id === currentUserId) {
        setIsCoach(false);
        return;
      }

      // Check if current user is the coach by querying coaches table
      if (!session.coach_id) {
        setIsCoach(false);
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session: authSession } } = await supabase.auth.getSession();
        
        if (!authSession?.access_token) {
          setIsCoach(false);
          return;
        }

        const { data: coach, error } = await supabase
          .from('coaches')
          .select('user_id')
          .eq('id', session.coach_id)
          .single();

        if (!error && coach && coach.user_id === currentUserId) {
          setIsCoach(true);
        } else {
          setIsCoach(false);
        }
      } catch (error) {
        console.error('Error checking coach status:', error);
        setIsCoach(false);
      }
    };

    checkIfCoach();
  }, [session, currentUserId]);

  // Determine remote user ID for deterministic leader election
  // Always use the other participant's auth user_id (not coach table id)
  // Check if current user is the coach by comparing with coach.user_id
  const isCurrentUserCoach = session.coach?.user_id === currentUserId;
  const otherUserId = isCurrentUserCoach
    ? session.user_id                 // If we're the coach, remote is the user's user_id
    : session.coach?.user_id ?? null; // If we're the user, remote is coach's user_id

  // Validate session data - detect data integrity issues
  const [sessionDataError, setSessionDataError] = useState<string | null>(null);
  
  useEffect(() => {
    // #region agent log
    logDebugEvent({
      location: "betrora-coach/RoomLayout.tsx:89",
      message: "otherUserId calculation",
      data: {
        currentUserId,
        sessionUserId: session.user_id,
        sessionCoachId: session.coach_id,
        sessionCoachUserId: session.coach?.user_id,
        otherUserId,
        isCurrentUserCoach,
        isCurrentUserClient: session.user_id === currentUserId,
        userIdsMatch: currentUserId === otherUserId,
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "A,B,C,D",
    });
    // #endregion
    
    // Check for data integrity issue: session.user_id === session.coach.user_id
    if (session.user_id && session.coach?.user_id && session.user_id === session.coach.user_id) {
      const errorMsg = 'DATA ERROR: Session has the same user as both client and coach. The session cannot connect because both participants have the same user ID. Please create a new session with a different client user, or update the coach to use a different auth account.';
      console.error('RoomLayout:', errorMsg, {
        sessionUserId: session.user_id,
        sessionCoachUserId: session.coach.user_id,
      });
      setSessionDataError(errorMsg);
    } else if (otherUserId === currentUserId) {
      const errorMsg = 'AUTH ERROR: You are logged in as the same user as the other participant. Please log in as a different user in one of the apps.';
      console.error('RoomLayout:', errorMsg, {
        currentUserId,
        otherUserId,
      });
      setSessionDataError(errorMsg);
    } else {
      setSessionDataError(null);
    }
    
    console.log('RoomLayout: Session data debug', {
      currentUserId,
      sessionUserId: session.user_id,
      sessionCoachId: session.coach_id,
      sessionCoachUserId: session.coach?.user_id,
      otherUserId,
      isCurrentUserCoach,
      isCurrentUserClient: session.user_id === currentUserId,
      userIdsMatch: currentUserId === otherUserId,
    });
  }, [currentUserId, session, otherUserId, isCurrentUserCoach]);

  const { session: authSession } = useSupabaseAuth();
  
  const {
    connectionState,
    localStream,
    remoteStream,
    isMicOn,
    isCameraOn,
    isRemoteAudioMuted,
    toggleMic,
    toggleCamera,
    toggleRemoteAudioMute,
    endCall,
    retry,
    sendMessage,
    messages,
    enableLocalMedia,
  } = useWebRTC(
    session.id,
    currentUserId,
    authSession?.access_token || null,
    otherUserId,
    false // coach starts with live media by default
  );

  const handleEndCall = () => {
    endCall();
    router.push('/sessions');
  };

  const handleEnableTwoWay = async () => {
    setIsEnablingMedia(true);
    try {
      await enableLocalMedia();
      showToast('Camera and microphone enabled', 'success');
    } catch (error) {
      console.error('Error enabling local media:', error);
      showToast('Failed to enable camera/microphone', 'error');
    } finally {
      setIsEnablingMedia(false);
    }
  };

  const getStatusColor = (state: ConnectionState) => {
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

  const getStatusLabel = (state: ConnectionState) => {
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

  const sessionTitle = session.user?.full_name || session.user?.email || 'Session';
  const isUser = session.user_id === currentUserId;
  const otherPersonName = isUser 
    ? (session.coach?.full_name || session.coach?.email || 'Coach')
    : (session.user?.full_name || session.user?.email || 'Client');

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col">
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
          
          {connectionState === 'failed' && (
            <button
              onClick={retry}
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
          <VideoArea
            localStream={localStream}
            remoteStream={remoteStream}
            isCameraOn={isCameraOn}
            otherPersonName={otherPersonName}
            connectionState={connectionState}
          />
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
        {/* Remote Audio Mute Button - Always visible when remote stream exists */}
        {remoteStream && (
          <button
            onClick={toggleRemoteAudioMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isRemoteAudioMuted
                ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-slate-700/50 text-white hover:bg-slate-700/70'
            }`}
            title={isRemoteAudioMuted ? 'Unmute remote audio' : 'Mute remote audio'}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isRemoteAudioMuted ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              )}
            </svg>
          </button>
        )}

        {/* Enable Two-Way Mode Button - Only shown in viewer mode (no local stream) */}
        {!localStream && connectionState !== 'disconnected' && (
          <button
            onClick={handleEnableTwoWay}
            disabled={isEnablingMedia}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-all bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Enable camera and microphone"
          >
            {isEnablingMedia ? (
              <div className="w-6 h-6 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        )}

        {/* Local Mic Toggle - Only shown when two-way is enabled */}
        {localStream && (
          <button
            onClick={toggleMic}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isMicOn
                ? 'bg-slate-700/50 text-white hover:bg-slate-700/70'
                : 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
            }`}
            title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMicOn ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              )}
            </svg>
          </button>
        )}

        {/* Local Camera Toggle - Only shown when two-way is enabled */}
        {localStream && (
          <button
            onClick={toggleCamera}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isCameraOn
                ? 'bg-slate-700/50 text-white hover:bg-slate-700/70'
                : 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
            }`}
            title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isCameraOn ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              )}
            </svg>
          </button>
        )}

        <button
          onClick={handleEndCall}
          className="w-14 h-14 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-all flex items-center justify-center"
          title="End call / Leave"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M7 11a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v2a4 4 0 01-4 4zm0 0v6a2 2 0 002 2h4a2 2 0 002-2v-6m-6 0h12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
