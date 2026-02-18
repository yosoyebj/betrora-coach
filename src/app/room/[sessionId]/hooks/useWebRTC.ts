'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SIGNAL_TYPES = new Set(['join', 'offer', 'answer', 'ice-candidate']);

const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error ?? 'unknown'));

const isAuthBootstrapError = (error: unknown) =>
  /(^|\s)(401|403)(\s|$)|Unauthorized|Forbidden|Missing auth token|Authorization header required/i.test(
    toErrorMessage(error)
  );

const createSignalingClient = (accessToken?: string | null): ReturnType<typeof createClient> =>
  createClient(supabaseUrl, supabaseAnonKey, {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
    auth: {
      // Keep signaling clients isolated from shared browser auth storage.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }) as ReturnType<typeof createClient>;

export type ConnectionState = 'connecting' | 'connected' | 'failed' | 'disconnected';

export interface Message {
  id: string;
  sender: 'local' | 'remote';
  text: string;
  timestamp: Date;
}

interface UseWebRTCReturn {
  connectionState: ConnectionState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  isRemoteAudioMuted: boolean;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleRemoteAudioMute: () => void;
  endCall: () => void;
  retry: () => void;
  sendMessage: (text: string) => void;
  messages: Message[];
  enableLocalMedia: () => Promise<void>; // New: Enable camera/mic for two-way communication
}

/**
 * WebRTC hook for coach app - matches @calmoraa implementation
 * 
 * Key features:
 * - Uses Supabase Realtime for signaling (channel: room:${sessionId})
 * - Deterministic initiator selection via sorted user IDs
 * - Viewer mode by default (no local tracks) - coach can enable later
 * - Same message schema as user app for compatibility
 * - Comprehensive logging for debugging
 */
export function useWebRTC(
  sessionId: string,
  currentUserId: string,
  sessionToken?: string | null,
  remoteUserId?: string | null,
  viewerMode: boolean = true // Default to viewer mode (no local tracks)
): UseWebRTCReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(false); // Default to muted in viewer mode
  const [isCameraOn, setIsCameraOn] = useState(false); // Default to camera off in viewer mode
  const [isRemoteAudioMuted, setIsRemoteAudioMuted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isViewerMode, setIsViewerMode] = useState(viewerMode);
  const initialViewerModeRef = useRef(viewerMode);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const channelRef = useRef<any>(null);
  const hasReceivedOfferRef = useRef(false);
  const remoteUserIdRef = useRef<string | null>(null);
  const joinSentRef = useRef(false);
  const offerSentRef = useRef(false);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const iceSentCountRef = useRef(0);
  const iceRecvCountRef = useRef(0);
  const joinRecvCountRef = useRef(0);
  const offerSentCountRef = useRef(0);
  const offerRecvCountRef = useRef(0);
  const answerSentCountRef = useRef(0);
  const answerRecvCountRef = useRef(0);
  const lastSignalSentAtRef = useRef<number | null>(null);
  const lastSignalRecvAtRef = useRef<number | null>(null);
  const subscribedStatusRef = useRef<string | null>(null);
  const effectRunCountRef = useRef(0);
  const cleanupRunCountRef = useRef(0);
  const processedMessageIdsRef = useRef<Set<string>>(new Set());
  const answerAppliedRef = useRef(false);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const setupGenerationRef = useRef(0);
  const signalingChannelNameRef = useRef<string | null>(null);
  const isRestartingIceRef = useRef(false);
  const lastIceRestartAtRef = useRef<number | null>(null);
  const signalingModeRef = useRef<'validated' | 'legacy-fallback'>('validated');
  const negotiationBlockedRef = useRef(false);
  const failureReasonRef = useRef<string | null>(null);
  const isRejoiningChannelRef = useRef(false);
  const signalBroadcastHandlerRef = useRef<((payload: any) => void) | null>(null);
  const channelStatusHandlerRef = useRef<((status: string) => void) | null>(null);
  const lastRejoinAccessTokenRef = useRef<string | null>(null);

  const ensureSupabaseClient = useCallback(async () => {
    if (supabaseRef.current) return supabaseRef.current;
    if (!supabaseUrl || !supabaseAnonKey) return null;

    let client: ReturnType<typeof createClient>;
    if (sessionToken) {
      try {
        const supabaseBrowser = createSupabaseBrowserClient();
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        const token = session?.access_token || sessionToken;

        if (token) {
          client = createSignalingClient(token);
          console.log('WebRTC: Initialized authenticated Supabase client for signaling');
        } else {
          client = createSignalingClient();
          console.warn('WebRTC: No token available, using unauthenticated client');
        }
      } catch (error) {
        console.error('Error getting session token, using unauthenticated client:', error);
        client = createSignalingClient();
      }
    } else {
      try {
        const supabaseBrowser = createSupabaseBrowserClient();
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (session?.access_token) {
          client = createSignalingClient(session.access_token);
          console.log('WebRTC: Initialized authenticated Supabase client from browser session');
        } else {
          client = createSignalingClient();
          console.warn('WebRTC: No session found, using unauthenticated client');
        }
      } catch (error) {
        console.error('Error getting browser session, using unauthenticated client:', error);
        client = createSignalingClient();
      }
    }

    supabaseRef.current = client;
    return client;
  }, [sessionToken]);

  // Initialize Supabase client early, but setup also hard-requires it via ensureSupabaseClient().
  useEffect(() => {
    void ensureSupabaseClient();
  }, [ensureSupabaseClient]);

  const fetchAuthToken = useCallback(async () => {
    if (sessionToken) {
      return sessionToken;
    }
    try {
      const supabaseBrowser = createSupabaseBrowserClient();
      const { data: { session } } = await supabaseBrowser.auth.getSession();
      return session?.access_token || null;
    } catch (error) {
      console.error('Failed to resolve auth token for RTC channel:', error);
      return null;
    }
  }, [sessionToken]);

  const fetchSignalingChannelName = useCallback(async () => {
    const token = await fetchAuthToken();
    if (!token) {
      throw new Error('Missing auth token for signaling channel validation');
    }

    const res = await fetch(`/api/rtc-channel?sessionId=${encodeURIComponent(sessionId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to fetch signaling channel: ${res.status} ${body}`);
    }
    const data = await res.json();
    if (!data?.channelName || typeof data.channelName !== 'string') {
      throw new Error('Invalid signaling channel response');
    }
    return data.channelName as string;
  }, [fetchAuthToken, sessionId]);

  const fetchIceServers = async () => {
    try {
      const res = await fetch('/api/ice-servers');
      if (res.ok) {
        const data = await res.json();
        const iceServers = data.iceServers || [];
        const hasTurn = iceServers.some((server: { urls?: string | string[] }) => {
          const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
          return urls.some((url) => typeof url === 'string' && url.startsWith('turn:'));
        });
        if (!hasTurn) {
          console.warn('WebRTC: TURN not available, using STUN-only ICE servers (connectivity may be limited)');
        }
        return iceServers;
      }
    } catch (error) {
      console.error('Failed to fetch ICE servers:', error);
    }
    
    // Fallback to default STUN servers
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ];
  };

  useEffect(() => {
    if (remoteUserId && remoteUserId !== currentUserId) {
      remoteUserIdRef.current = remoteUserId;
    }
  }, [remoteUserId, currentUserId]);

  const setupPeerConnection = useCallback(async () => {
    const setupGeneration = ++setupGenerationRef.current;
    const isStaleSetup = () => setupGeneration !== setupGenerationRef.current;
    try {
      // Prevent double init in React StrictMode
      if (peerConnectionRef.current) {
        if (peerConnectionRef.current.connectionState === 'closed') {
          peerConnectionRef.current = null;
        } else {
          return peerConnectionRef.current;
        }
      }
      setConnectionState('connecting');

      // Get ICE servers
      const iceServers = await fetchIceServers();

      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers });
      peerConnectionRef.current = pc;

      console.log('WebRTC: Peer connection created', {
        sessionId,
        currentUserId,
        viewerMode: initialViewerModeRef.current,
        iceServersCount: iceServers.length,
      });

      // Get user media only if not in viewer mode (coach can enable later)
      if (!initialViewerModeRef.current) {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          console.log('WebRTC: Got user media (two-way mode)');
        } catch (err: any) {
          if (err?.name === 'NotReadableError' || err?.name === 'NotAllowedError') {
            console.warn('WebRTC: Camera blocked, falling back to audio-only');
            stream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: true,
            });
          } else {
            throw err;
          }
        }
        
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsMicOn(true);
        setIsCameraOn(stream.getVideoTracks().length > 0);

        // Add tracks to peer connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      } else {
        console.log('WebRTC: Viewer mode - not requesting local media (coach will only receive)');
        const hasAudioRecv = pc
          .getTransceivers()
          .some((t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio');
        const hasVideoRecv = pc
          .getTransceivers()
          .some((t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video');
        if (!hasAudioRecv) pc.addTransceiver('audio', { direction: 'recvonly' });
        if (!hasVideoRecv) pc.addTransceiver('video', { direction: 'recvonly' });
        console.log('rtc_audit.viewer_recvonly_transceivers', { sessionId, hasAudioRecv, hasVideoRecv });
      }

      // Handle remote stream
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          const tracks = stream.getTracks();
          const otherUserId = remoteUserIdRef.current || remoteUserId || 'unknown';
          tracks.forEach((track) => {
            console.log(`REMOTE TRACK RECEIVED kind=${track.kind} from ${otherUserId}`, {
              kind: track.kind,
              id: track.id,
              enabled: track.enabled,
              readyState: track.readyState,
              otherUserId: otherUserId,
            });
          });
          setRemoteStream(stream);
        }
      };

      // Handle ICE candidates - sent via Supabase Realtime (NOT data channel)
      pc.onicecandidate = (event) => {
        if (negotiationBlockedRef.current) return;
        if (event.candidate && channelRef.current && subscribedStatusRef.current === 'SUBSCRIBED') {
          const otherUserId = remoteUserIdRef.current || remoteUserId || null;
          try {
            const messageId = crypto.randomUUID();
            // Send ICE candidate via Supabase Realtime broadcast
            void channelRef.current.send({
              type: 'broadcast',
              event: 'signal',
              payload: {
                id: messageId,
                type: 'ice-candidate',
                candidate: event.candidate,
                from: currentUserId,
                to: otherUserId,
              },
            }).then((sendResult: string) => {
              if (sendResult === 'ok') {
                iceSentCountRef.current++;
                console.log('WebRTC: ICE sent count', iceSentCountRef.current);
              } else {
                console.warn('WebRTC: ICE candidate send returned non-ok status', { sendResult, messageId });
              }
            }).catch((sendError: unknown) => {
              console.error('WebRTC: Error sending ICE candidate', sendError);
            });
          } catch (error) {
            console.error('WebRTC: Error sending ICE candidate', error);
          }
        }
      };

      // Handle connection state changes with comprehensive logging
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log('WebRTC: Connection state changed', {
          connectionState: state,
          signalingState: pc.signalingState,
          iceConnectionState: pc.iceConnectionState,
          iceGatheringState: pc.iceGatheringState,
        });
        
        if (state === 'connected') {
          setConnectionState('connected');
          console.log('WebRTC: ✅ Peer connection established');
        } else if (state === 'failed' || state === 'disconnected') {
          setConnectionState('failed');
          console.error('WebRTC: ❌ Peer connection failed or disconnected', {
            connectionState: state,
            iceConnectionState: pc.iceConnectionState,
          });
        } else if (state === 'connecting') {
          setConnectionState('connecting');
          console.log('WebRTC: 🔄 Peer connection connecting...');
        }
      };

      // Log ICE connection state changes
      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        console.log('WebRTC: ICE connection state changed', {
          iceConnectionState: iceState,
          connectionState: pc.connectionState,
        });

        if ((iceState === 'failed' || iceState === 'disconnected') && !isRestartingIceRef.current && !negotiationBlockedRef.current) {
          const lastRestartAgo = lastIceRestartAtRef.current ? Date.now() - lastIceRestartAtRef.current : null;
          if (lastRestartAgo !== null && lastRestartAgo < 8000) {
            return;
          }
          const otherUserId = remoteUserIdRef.current;
          if (!otherUserId || otherUserId === currentUserId) {
            return;
          }
          if (!channelRef.current || subscribedStatusRef.current !== 'SUBSCRIBED') {
            return;
          }
          if (pc.signalingState !== 'stable') {
            return;
          }

          console.log('rtc_audit.ice_recovery_trigger', {
            sessionId,
            currentUserId,
            otherUserId,
            iceState,
            signalingState: pc.signalingState,
          });
          isRestartingIceRef.current = true;
          void (async () => {
            makingOfferRef.current = true;
            try {
              if (pc.signalingState !== 'stable') return;
              const restartOffer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(restartOffer);
              const messageId = crypto.randomUUID();
              const sendResult = await channelRef.current.send({
                type: 'broadcast',
                event: 'signal',
                payload: {
                  id: messageId,
                  type: 'offer',
                  offer: restartOffer,
                  from: currentUserId,
                  to: otherUserId,
                  restartIce: true,
                },
              });
              if (sendResult === 'ok') {
                offerSentRef.current = true;
                offerSentCountRef.current++;
                lastSignalSentAtRef.current = Date.now();
                lastIceRestartAtRef.current = Date.now();
                console.log('rtc_audit.ice_restart_offer', { sessionId, messageId, currentUserId, otherUserId, sent: true });
              } else {
                throw new Error(`ICE restart offer send failed: ${sendResult}`);
              }
            } catch (error) {
              console.error('WebRTC: ICE restart offer failed', error);
              const activePc = peerConnectionRef.current;
              if (activePc && activePc.signalingState === 'have-local-offer') {
                try {
                  await activePc.setLocalDescription({ type: 'rollback' });
                } catch {
                  // no-op
                }
              }
            } finally {
              makingOfferRef.current = false;
              isRestartingIceRef.current = false;
            }
          })();
        }
      };

      // Log signaling state changes
      const logSignalingState = () => {
        console.log('WebRTC: Signaling state changed', {
          signalingState: pc.signalingState,
        });
      };
      
      // Monitor signaling state (polling since there's no event)
      const signalingInterval = setInterval(() => {
        logSignalingState();
      }, 2000);
      
      // Clear interval on cleanup
      setTimeout(() => clearInterval(signalingInterval), 60000);

      // ============================================
      // DATA CHANNEL: Used ONLY for chat messages
      // ============================================
      // IMPORTANT: Data channel is NOT used for WebRTC signaling.
      // All signaling (offer/answer/ICE candidates) uses Supabase Realtime only.
      // Data channel is exclusively for chat message exchange.

      // Handle incoming data channel (when remote peer creates it)
      const attachDataChannelHandlers = (channel: RTCDataChannel) => {
        channel.onopen = () => {
          console.log('Data channel opened', { label: channel.label, readyState: channel.readyState });
        };

        channel.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'message') {
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now().toString(),
                  sender: 'remote',
                  text: data.text,
                  timestamp: new Date(),
                },
              ]);
            }
          } catch (error) {
            console.error('Error parsing data channel message:', error);
          }
        };
      };

      pc.ondatachannel = (event) => {
        const channel = event.channel;
        dataChannelRef.current = channel;
        attachDataChannelHandlers(channel);
      };

      // ============================================
      // SIGNALING: Uses Supabase Realtime ONLY
      // ============================================
      // IMPORTANT: All WebRTC signaling (SDP offers, answers, ICE candidates)
      // is exchanged via Supabase Realtime broadcast channels.
      // The data channel is NOT used for signaling - only for chat messages.
      // Set up signaling via Supabase Realtime
      const supabaseClient = await ensureSupabaseClient();
      if (!supabaseClient) {
        throw new Error('WebRTC: Supabase client is not configured for signaling');
      }

      // Guard against duplicate channel creation
      if (channelRef.current) {
        console.log('WebRTC: Channel already exists, skipping creation', {
          sessionId,
          channelName: `room:${sessionId}`,
          timestamp: Date.now(),
        });
        return pc;
      }

      let channelName = signalingChannelNameRef.current;
      if (!channelName) {
        try {
          channelName = await fetchSignalingChannelName();
          signalingModeRef.current = 'validated';
        } catch (error) {
          if (isAuthBootstrapError(error)) {
            console.error('WebRTC: auth-related signaling bootstrap failure (no legacy fallback)', {
              error: toErrorMessage(error),
            });
            throw error;
          }
          signalingModeRef.current = 'legacy-fallback';
          console.warn('WebRTC: Falling back to legacy channel name (rtc-channel validation unavailable)', error);
          channelName = `room:${sessionId}`;
        }
      }
      signalingChannelNameRef.current = channelName;
      const channel = supabaseClient.channel(channelName, {
        config: {
          broadcast: { self: false },
        },
      });
      channelRef.current = channel;
      console.log('WebRTC: Channel created', {
        sessionId,
        channelName,
        signalingMode: signalingModeRef.current,
        timestamp: Date.now(),
      });
      console.log('rtc_audit.signaling_mode', { sessionId, mode: signalingModeRef.current, channelName });

        // Helper function to attempt offer creation
        const attemptOfferCreation = async (otherUserId: string, isInitiator?: boolean) => {
          if (isStaleSetup()) return;
          if (negotiationBlockedRef.current) return;
          // Re-check if we should be initiator (in case otherUserId was discovered)
          if (isInitiator === undefined) {
            if (otherUserId === currentUserId) {
              console.error('WebRTC: Cannot create offer - otherUserId matches currentUserId');
              return;
            }
            // Use string comparison for deterministic initiator selection
            isInitiator = currentUserId < otherUserId;
          }

          // Only create offer if:
          // 1. We're the initiator (deterministic and symmetric)
          // 2. Signaling state is 'stable' (not already in offer/answer exchange)
          // 3. We haven't received an offer yet
          // 4. We haven't already sent an offer
          if (isInitiator && pc.signalingState === 'stable' && !hasReceivedOfferRef.current && !offerSentRef.current) {
            if (subscribedStatusRef.current !== 'SUBSCRIBED') {
              console.warn('WebRTC: Cannot send offer - channel not subscribed', {
                status: subscribedStatusRef.current,
                currentUserId,
                otherUserId,
              });
              return;
            }
            try {
              makingOfferRef.current = true;
              if (!dataChannelRef.current) {
                try {
                  const dataChannel = pc.createDataChannel('chat', { ordered: true });
                  dataChannelRef.current = dataChannel;
                  dataChannel.onopen = () => {
                    console.log('Data channel opened', { label: dataChannel.label, readyState: dataChannel.readyState });
                  };
                  dataChannel.onmessage = (event) => {
                    try {
                      const data = JSON.parse(event.data);
                      if (data.type === 'message') {
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: Date.now().toString(),
                            sender: 'remote',
                            text: data.text,
                            timestamp: new Date(),
                          },
                        ]);
                      }
                    } catch (error) {
                      console.error('Error parsing data channel message:', error);
                    }
                  };
                  console.log('rtc_audit.datachannel_status', { created: true });
                } catch (error) {
                  console.warn('rtc_audit.datachannel_status', { created: false, error: toErrorMessage(error) });
                }
              }
              console.log('WebRTC: Creating offer as initiator', {
                currentUserId,
                otherUserId,
              });
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              try {
                const messageId = crypto.randomUUID();
                const sendResult = await channel.send({
                  type: 'broadcast',
                  event: 'signal',
                  payload: {
                    id: messageId,
                    type: 'offer',
                    offer: offer,
                    from: currentUserId,
                    to: otherUserId,
                  },
                });
                if (sendResult !== 'ok') {
                  throw new Error(`Offer send failed with status: ${sendResult}`);
                }
                offerSentRef.current = true;
                offerSentCountRef.current++;
                lastSignalSentAtRef.current = Date.now();
                console.log('WebRTC: SEND offer', { currentUserId, otherUserId, messageId, sendResult });
              } catch (sendError) {
                console.error('WebRTC: Error sending offer', sendError);
                offerSentRef.current = false; // Allow retry
                const activePc = peerConnectionRef.current;
                if (activePc && activePc.signalingState === 'have-local-offer') {
                  try {
                    await activePc.setLocalDescription({ type: 'rollback' });
                    console.log('WebRTC: Rolled back local offer after send failure');
                  } catch (rollbackError) {
                    console.error('WebRTC: Failed to rollback local offer', rollbackError);
                  }
                }
              }
            } catch (error) {
              console.error('Error creating offer:', error);
            } finally {
              makingOfferRef.current = false;
            }
          } else {
            console.log('WebRTC: Waiting for offer', {
              isInitiator,
              signalingState: pc.signalingState,
              hasReceivedOffer: hasReceivedOfferRef.current,
              offerSent: offerSentRef.current,
              currentUserId,
              otherUserId,
            });
          }
        };

        const signalHandler = (payload: any) => {
          if (isStaleSetup()) return;
          // Raw event logging to verify payload structure (log once per event type)
          try {
            const safePayload = {
              type: payload.type,
              event: payload.event,
              payload: payload.payload,
            };
            console.log('RAW SIGNAL EVENT:', JSON.stringify(safePayload, null, 2));
          } catch {
            console.log('RAW SIGNAL EVENT (stringified):', payload);
          }

          const signal = payload?.payload as Record<string, unknown> | undefined;
          if (!signal) return;

          const from = typeof signal.from === 'string' ? signal.from : null;
          const to = typeof signal.to === 'string' ? signal.to : null;
          const messageId = typeof signal.id === 'string' ? signal.id : undefined;
          const signalType = typeof signal.type === 'string' ? signal.type : null;
          const remoteSignalingMode = typeof signal.signalingMode === 'string' ? signal.signalingMode : null;

          if (!from) return;
          if (from === currentUserId) return; // Ignore own signals
          if (to && to !== currentUserId) return; // Ignore signals addressed to someone else

          const expectedRemoteId = remoteUserId || remoteUserIdRef.current;
          if (expectedRemoteId && from !== expectedRemoteId) {
            console.warn('rtc_audit.signal_recv', { accepted: false, reason: 'unexpected_sender', from, expectedRemoteId, signalType });
            return;
          }
          if (!signalType || !SIGNAL_TYPES.has(signalType)) {
            console.warn('rtc_audit.signal_recv', { accepted: false, reason: 'unknown_type', from, signalType });
            return;
          }

          // Deduplicate messages by ID
          if (messageId) {
            if (processedMessageIdsRef.current.has(messageId)) {
              console.log('WebRTC: Ignoring duplicate message', { messageId, type: signalType, from });
              return;
            }
            processedMessageIdsRef.current.add(messageId);
            // Limit set size to prevent memory leak (keep last 1000)
            if (processedMessageIdsRef.current.size > 1000) {
              const firstId = processedMessageIdsRef.current.values().next().value;
              if (firstId) {
                processedMessageIdsRef.current.delete(firstId);
              }
            }
          }

          if (negotiationBlockedRef.current) {
            console.warn('rtc_audit.signal_recv', {
              accepted: false,
              reason: failureReasonRef.current || 'negotiation_blocked',
              from,
              signalType,
            });
            return;
          }

          lastSignalRecvAtRef.current = Date.now();

          // Track remote user ID from first signal received
          if (!remoteUserIdRef.current && from) {
            remoteUserIdRef.current = from;
            console.log('WebRTC: Discovered remote user ID from signal', { from, currentUserId });
          }

          if (signalType === 'join') {
            if (expectedRemoteId && from === expectedRemoteId && remoteSignalingMode !== signalingModeRef.current) {
              negotiationBlockedRef.current = true;
              failureReasonRef.current = 'SIGNALING_MODE_MISMATCH';
              setConnectionState('failed');
              console.warn('rtc_audit.signal_recv', {
                accepted: false,
                reason: 'SIGNALING_MODE_MISMATCH',
                sessionId,
                from,
                expectedRemoteId,
                localMode: signalingModeRef.current,
                remoteMode: remoteSignalingMode,
              });
              return;
            }

            joinRecvCountRef.current++;
            console.log('WebRTC: RECV join from', from);
            // Discover remote user ID from join message (always update if different)
            if (from !== currentUserId) {
              const wasAlreadySet = remoteUserIdRef.current === from;
              remoteUserIdRef.current = from;
              console.log('WebRTC: SET otherUserId', { from, currentUserId, wasAlreadySet });
              // Trigger offer creation if we're initiator (check even if was already set)
              const isInitiator = currentUserId < from;
              console.log('WebRTC: INITIATOR?', isInitiator, { currentUserId, otherUserId: from });
              if (isInitiator && pc && pc.signalingState === 'stable' && !offerSentRef.current && !hasReceivedOfferRef.current) {
                console.log('WebRTC: Triggering offer creation from join handler', {
                  pcExists: !!pc,
                  signalingState: pc.signalingState,
                  offerSent: offerSentRef.current,
                  hasReceivedOffer: hasReceivedOfferRef.current,
                });
                attemptOfferCreation(from, true);
              } else if (
                isInitiator &&
                pc?.signalingState === 'have-local-offer' &&
                offerSentRef.current &&
                answerRecvCountRef.current === 0
              ) {
                const offerAgeMs = lastSignalSentAtRef.current ? Date.now() - lastSignalSentAtRef.current : null;
                if (offerAgeMs === null || offerAgeMs > 3000) {
                  console.warn('WebRTC: Late join detected while waiting for answer, rolling back and re-offering', {
                    offerAgeMs,
                    currentUserId,
                    otherUserId: from,
                  });
                  void (async () => {
                    try {
                      await pc.setLocalDescription({ type: 'rollback' });
                      offerSentRef.current = false;
                      answerAppliedRef.current = false;
                      hasReceivedOfferRef.current = false;
                      attemptOfferCreation(from, true);
                    } catch (rollbackError) {
                      console.error('WebRTC: Failed to rollback local offer on late-join recovery', rollbackError);
                    }
                  })();
                }
              } else {
                console.log('WebRTC: Cannot create offer from join handler', {
                  isInitiator,
                  pcExists: !!pc,
                  signalingState: pc?.signalingState,
                  offerSent: offerSentRef.current,
                  hasReceivedOffer: hasReceivedOfferRef.current,
                });
              }
            }
          } else if (signalType === 'offer') {
            offerRecvCountRef.current++;
            console.log('WebRTC: RECV offer', { from, currentUserId });
            if (signal.offer) {
              handleOffer(signal.offer as RTCSessionDescriptionInit, pc, from, messageId);
            }
          } else if (signalType === 'answer') {
            answerRecvCountRef.current++;
            console.log('WebRTC: RECV answer', { from, currentUserId, messageId });
            if (signal.answer) {
              handleAnswer(signal.answer as RTCSessionDescriptionInit, pc, messageId);
            }
          } else if (signalType === 'ice-candidate') {
            handleIceCandidate(signal.candidate as RTCIceCandidateInit, pc);
          }
        };

        const statusHandler = (status: string) => {
          if (isStaleSetup()) return;
          subscribedStatusRef.current = status;
          console.log('WebRTC: Subscription status changed', {
            status,
            sessionId,
            channelName,
            signalingMode: signalingModeRef.current,
            timestamp: Date.now(),
          });
          if (status === 'SUBSCRIBED') {
            console.log('WebRTC: SIGNAL SUBSCRIBED');
            if (negotiationBlockedRef.current) return;

            // Send join signal immediately to break deadlock
            if (!joinSentRef.current && channelRef.current && subscribedStatusRef.current === 'SUBSCRIBED') {
              try {
                const messageId = crypto.randomUUID();
                void channelRef.current
                  .send({
                    type: 'broadcast',
                    event: 'signal',
                    payload: {
                      id: messageId,
                      type: 'join',
                      from: currentUserId,
                      to: remoteUserId || null,
                      signalingMode: signalingModeRef.current,
                      ts: Date.now(),
                    },
                  })
                  .then((sendResult: string) => {
                    if (sendResult === 'ok') {
                      joinSentRef.current = true;
                      lastSignalSentAtRef.current = Date.now();
                      console.log('WebRTC: SEND join', { currentUserId, messageId });
                    } else {
                      console.warn('WebRTC: Join send returned non-ok status', { sendResult, messageId });
                    }
                  })
                  .catch((sendError: unknown) => {
                    console.error('WebRTC: Error sending join signal', sendError);
                  });
              } catch (error) {
                console.error('WebRTC: Error sending join signal', error);
              }
            } else if (!joinSentRef.current) {
              console.warn('WebRTC: Cannot send join - channel not ready', {
                hasChannel: !!channelRef.current,
                status: subscribedStatusRef.current,
              });
            }

            const otherUserId = remoteUserId || remoteUserIdRef.current;

            console.log('WebRTC: Subscribed to channel', {
              currentUserId,
              otherUserId,
              sessionId,
              hasRemoteUserId: !!otherUserId,
              userIdsMatch: currentUserId === otherUserId,
            });

            if (!otherUserId) {
              console.warn('WebRTC: Waiting for remote user ID - cannot determine initiator yet');
              const checkInterval = setInterval(() => {
                const discoveredOtherId = remoteUserIdRef.current;
                if (discoveredOtherId && discoveredOtherId !== currentUserId) {
                  clearInterval(checkInterval);
                  console.log('WebRTC: Discovered remote user ID, attempting offer creation', {
                    currentUserId,
                    discoveredOtherId,
                  });
                  attemptOfferCreation(discoveredOtherId);
                }
              }, 500);
              setTimeout(() => clearInterval(checkInterval), 10000);
              return;
            }

            if (otherUserId === currentUserId) {
              console.error(
                'WebRTC: ERROR - otherUserId matches currentUserId! Both users appear to be the same. Check that you are logged in as different users.'
              );
              return;
            }

            // Use string comparison for deterministic initiator selection
            const isInitiator = currentUserId < otherUserId;

            console.log('WebRTC: INITIATOR?', isInitiator, {
              currentUserId,
              otherUserId,
            });

            // Attempt offer creation after a short delay to ensure everything is ready
            // But also set up a check to retry if join signal arrives later
            setTimeout(() => {
              if (pc && pc.signalingState === 'stable' && !offerSentRef.current && !hasReceivedOfferRef.current) {
                attemptOfferCreation(otherUserId, isInitiator);
              } else {
                console.log('WebRTC: Deferring offer creation', {
                  pcExists: !!pc,
                  signalingState: pc?.signalingState,
                  offerSent: offerSentRef.current,
                  hasReceivedOffer: hasReceivedOfferRef.current,
                });
              }
            }, 1000);
          }
        };

        signalBroadcastHandlerRef.current = signalHandler;
        channelStatusHandlerRef.current = statusHandler;
        channel.on('broadcast', { event: 'signal' }, signalHandler).subscribe(statusHandler);

      return pc;
    } catch (error: any) {
      console.error('WebRTC: ❌ Error setting up peer connection:', error);
      setConnectionState('failed');
      throw error;
    }
  }, [sessionId, currentUserId, ensureSupabaseClient, fetchSignalingChannelName]);

  useEffect(() => {
    const supabaseBrowser = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange((event: AuthChangeEvent, authSession: Session | null) => {
      console.log('rtc_audit.auth_event', {
        sessionId,
        currentUserId,
        event,
        hasSession: !!authSession,
      });

      if (event === 'SIGNED_OUT') {
        supabaseRef.current = null;
        lastRejoinAccessTokenRef.current = null;
        return;
      }
      if (event !== 'TOKEN_REFRESHED') return;

      const accessToken = authSession?.access_token ?? null;
      if (!accessToken) return;
      if (accessToken === lastRejoinAccessTokenRef.current) return;
      lastRejoinAccessTokenRef.current = accessToken;

      if (isRejoiningChannelRef.current || negotiationBlockedRef.current) return;

      const channelName = signalingChannelNameRef.current;
      const signalHandler = signalBroadcastHandlerRef.current;
      const statusHandler = channelStatusHandlerRef.current;
      if (!channelName || !signalHandler || !statusHandler || !channelRef.current) return;

      void (async () => {
        isRejoiningChannelRef.current = true;
        console.log('rtc_audit.channel_rejoin', {
          sessionId,
          phase: 'start',
          channelName,
          mode: signalingModeRef.current,
          event,
        });

        try {
          await Promise.resolve(channelRef.current?.unsubscribe());
          channelRef.current = null;
          subscribedStatusRef.current = null;
          joinSentRef.current = false;
          supabaseRef.current = null;

          const nextClient = await ensureSupabaseClient();
          if (!nextClient) {
            throw new Error('Supabase client unavailable during rejoin');
          }

          const rejoinedChannel = nextClient.channel(channelName, {
            config: {
              broadcast: { self: false },
            },
          });

          channelRef.current = rejoinedChannel;
          rejoinedChannel.on('broadcast', { event: 'signal' }, signalHandler).subscribe(statusHandler);
          console.log('rtc_audit.channel_rejoin', {
            sessionId,
            phase: 'subscribed',
            channelName,
            mode: signalingModeRef.current,
          });
        } catch (error) {
          console.error('rtc_audit.channel_rejoin', {
            sessionId,
            phase: 'error',
            error: toErrorMessage(error),
          });
        } finally {
          isRejoiningChannelRef.current = false;
        }
      })();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionId, currentUserId, ensureSupabaseClient]);

  const handleOffer = async (
    offer: RTCSessionDescriptionInit,
    pc: RTCPeerConnection,
    fromUserId: string,
    messageId?: string
  ) => {
    try {
      if (negotiationBlockedRef.current) return;
      const isPolitePeer = currentUserId > fromUserId;
      const offerCollision = makingOfferRef.current || pc.signalingState !== 'stable';
      ignoreOfferRef.current = !isPolitePeer && offerCollision;

      if (ignoreOfferRef.current) {
        console.warn('WebRTC: Ignoring colliding offer as impolite peer', {
          currentState: pc.signalingState,
          messageId,
          fromUserId,
          makingOffer: makingOfferRef.current,
        });
        return;
      }

      if (offerCollision && pc.signalingState === 'have-local-offer') {
        await pc.setLocalDescription({ type: 'rollback' });
        offerSentRef.current = false;
      }

      console.log('WebRTC: 📥 Received offer, creating answer', {
        offerType: offer.type,
        sdpLength: offer.sdp?.length,
        messageId,
      });
      answerAppliedRef.current = false; // Reset answer flag for new negotiation
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      hasReceivedOfferRef.current = true;
      
      // Flush queued ICE candidates
      if (iceCandidateQueueRef.current && iceCandidateQueueRef.current.length > 0) {
        console.log('WebRTC: ICE flush count', iceCandidateQueueRef.current.length);
        for (const queuedCandidate of iceCandidateQueueRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(queuedCandidate));
          } catch (error) {
            console.error('Error adding queued ICE candidate:', error);
          }
        }
        iceCandidateQueueRef.current = [];
      }
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      if (channelRef.current && subscribedStatusRef.current === 'SUBSCRIBED') {
        try {
          const messageId = crypto.randomUUID();
          const targetUserId = remoteUserIdRef.current || remoteUserId || fromUserId;
          const sendResult = await channelRef.current.send({
            type: 'broadcast',
            event: 'signal',
            payload: {
              id: messageId,
              type: 'answer',
              answer: answer,
              from: currentUserId,
              to: targetUserId,
            },
          });
          if (sendResult !== 'ok') {
            throw new Error(`Answer send failed with status: ${sendResult}`);
          }
          answerSentCountRef.current++;
          lastSignalSentAtRef.current = Date.now();
          console.log('WebRTC: SEND answer', { currentUserId, messageId });
        } catch (error) {
          console.error('WebRTC: Error sending answer', error);
        }
      } else {
        console.warn('WebRTC: Cannot send answer - channel not ready', {
          hasChannel: !!channelRef.current,
          status: subscribedStatusRef.current,
        });
      }
    } catch (error) {
      console.error('WebRTC: ❌ Error handling offer:', error);
      setConnectionState('failed');
    }
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit, pc: RTCPeerConnection, messageId?: string) => {
    try {
      if (negotiationBlockedRef.current) return;
      // Guard: Only process answer if we're in have-local-offer state (initiator waiting for answer)
      if (pc.signalingState !== 'have-local-offer') {
        console.warn('WebRTC: Ignoring answer - wrong signaling state', {
          currentState: pc.signalingState,
          expectedState: 'have-local-offer',
          messageId,
          answerApplied: answerAppliedRef.current,
        });
        return;
      }

      // Guard: Prevent duplicate answer processing
      if (answerAppliedRef.current) {
        console.warn('WebRTC: Ignoring duplicate answer', { messageId, answerApplied: answerAppliedRef.current });
        return;
      }

      console.log('WebRTC: 📥 Received answer', {
        answerType: answer.type,
        sdpLength: answer.sdp?.length,
        messageId,
      });
      answerAppliedRef.current = true;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      
      // Flush queued ICE candidates
      if (iceCandidateQueueRef.current && iceCandidateQueueRef.current.length > 0) {
        console.log('WebRTC: ICE flush count', iceCandidateQueueRef.current.length);
        for (const queuedCandidate of iceCandidateQueueRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(queuedCandidate));
          } catch (error) {
            console.error('Error adding queued ICE candidate:', error);
          }
        }
        iceCandidateQueueRef.current = [];
      }
      
      console.log('WebRTC: ✅ Set remote description from answer');
    } catch (error) {
      console.error('WebRTC: ❌ Error handling answer:', error);
      answerAppliedRef.current = false; // Allow retry on error
      setConnectionState('failed');
    }
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit, pc: RTCPeerConnection) => {
    if (!candidate || !candidate.candidate) {
      console.log('WebRTC: ICE candidate gathering complete (null candidate)');
      return;
    }
    
    iceRecvCountRef.current++;
    console.log('WebRTC: ICE recv count', iceRecvCountRef.current);
    
    if (pc.remoteDescription === null) {
      // Queue candidate if remoteDescription not set yet
      if (!iceCandidateQueueRef.current) {
        iceCandidateQueueRef.current = [];
      }
      iceCandidateQueueRef.current.push(candidate);
      console.log('WebRTC: ICE queued count', iceCandidateQueueRef.current.length);
      return;
    }
    
    // Add candidate immediately if remoteDescription is set
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      // Ignore errors for duplicate or invalid candidates (common in WebRTC)
      if (error instanceof Error && error.message.includes('already')) {
        console.log('WebRTC: ICE candidate already processed (ignoring)');
      } else {
        console.error('WebRTC: ❌ Error handling ICE candidate:', error);
      }
    }
  };

  // Health snapshot logging every 2 seconds
  useEffect(() => {
    const healthInterval = setInterval(() => {
      const pc = peerConnectionRef.current;
      const snapshot = {
        subscribedStatus: subscribedStatusRef.current,
        joinSent: joinSentRef.current,
        joinRecv: joinRecvCountRef.current,
        otherUserId: remoteUserIdRef.current || remoteUserId || null,
        isInitiator: remoteUserIdRef.current 
          ? currentUserId < remoteUserIdRef.current 
          : (remoteUserId ? currentUserId < remoteUserId : null),
        pcExists: !!pc,
        pcSignalingState: pc?.signalingState || null,
        localStreamExists: !!localStreamRef.current,
        localStreamTrackCount: localStreamRef.current?.getTracks().length || 0,
        offerSent: offerSentRef.current,
        offerSentCount: offerSentCountRef.current,
        offerRecvCount: offerRecvCountRef.current,
        answerSentCount: answerSentCountRef.current,
        answerRecvCount: answerRecvCountRef.current,
        iceSentCount: iceSentCountRef.current,
        iceRecvCount: iceRecvCountRef.current,
        iceQueuedCount: iceCandidateQueueRef.current?.length || 0,
        lastSignalSentAt: lastSignalSentAtRef.current,
        lastSignalRecvAt: lastSignalRecvAtRef.current,
        hasReceivedOffer: hasReceivedOfferRef.current,
        connectionState: pc?.connectionState || null,
        iceConnectionState: pc?.iceConnectionState || null,
        effectRunCount: effectRunCountRef.current,
        cleanupRunCount: cleanupRunCountRef.current,
      };
      console.log('WebRTC Health Snapshot:', snapshot);
    }, 2000);

    return () => clearInterval(healthInterval);
  }, [currentUserId, remoteUserId, isViewerMode]);

  // Initialize connection on mount
  useEffect(() => {
    effectRunCountRef.current++;
    const currentSessionId = sessionId;
    const currentUserIdValue = currentUserId;
    const effectRunNumber = effectRunCountRef.current;
    
    console.log('WebRTC: Setup effect running', {
      runNumber: effectRunNumber,
      sessionId: currentSessionId,
      currentUserId: currentUserIdValue,
      timestamp: Date.now(),
      hasExistingChannel: !!channelRef.current,
      hasExistingPC: !!peerConnectionRef.current,
    });

    // Guard: Don't recreate if channel already exists for this session
    if (channelRef.current && peerConnectionRef.current) {
      console.log('WebRTC: Channel and PC already exist, skipping setup', {
        sessionId: currentSessionId,
        runNumber: effectRunNumber,
      });
      return;
    }

    setupPeerConnection().catch((error) => {
      console.error('Failed to setup peer connection:', error);
      setConnectionState('failed');
    });

    return () => {
      setupGenerationRef.current++;
      cleanupRunCountRef.current++;
      const cleanupRunNumber = cleanupRunCountRef.current;
      console.log('WebRTC: Cleanup running', {
        runNumber: cleanupRunNumber,
        sessionId: currentSessionId,
        currentUserId: currentUserIdValue,
        timestamp: Date.now(),
        reason: 'unmount or sessionId/currentUserId changed',
      });

      // Complete cleanup: Stop all media tracks first (prevents camera staying on)
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      // Close data channel explicitly
      if (dataChannelRef.current) {
        try {
          dataChannelRef.current.close();
        } catch (error) {
          console.error('Error closing data channel:', error);
        }
        dataChannelRef.current = null;
      }
      // Close peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      // Unsubscribe from Supabase Realtime channel
      if (channelRef.current) {
        console.log('WebRTC: Unsubscribing channel', {
          sessionId: currentSessionId,
          cleanupRunNumber: cleanupRunNumber,
        });
        channelRef.current.unsubscribe();
        channelRef.current = null; // Clear ref after unsubscribe
      }
      localStreamRef.current = null;
      setLocalStream(null);
      setRemoteStream(null);
      setIsMicOn(false);
      setIsCameraOn(false);
      setIsViewerMode(initialViewerModeRef.current);
      joinSentRef.current = false;
      offerSentRef.current = false;
      hasReceivedOfferRef.current = false;
      answerAppliedRef.current = false;
      makingOfferRef.current = false;
      ignoreOfferRef.current = false;
      iceCandidateQueueRef.current = [];
      processedMessageIdsRef.current.clear();
      subscribedStatusRef.current = null;
      remoteUserIdRef.current = null;
      signalingChannelNameRef.current = null;
      isRestartingIceRef.current = false;
      lastIceRestartAtRef.current = null;
      signalingModeRef.current = 'validated';
      negotiationBlockedRef.current = false;
      failureReasonRef.current = null;
      isRejoiningChannelRef.current = false;
      signalBroadcastHandlerRef.current = null;
      channelStatusHandlerRef.current = null;
    };
  }, [sessionId, currentUserId, setupPeerConnection]);

  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMicOn((prev) => !prev);
      console.log('WebRTC: Microphone toggled', { enabled: !isMicOn });
    } else {
      console.warn('WebRTC: Cannot toggle mic - no local stream (viewer mode?)');
      setIsMicOn(false);
    }
  }, [isMicOn]);

  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsCameraOn((prev) => !prev);
      console.log('WebRTC: Camera toggled', { enabled: !isCameraOn });
    } else {
      console.warn('WebRTC: Cannot toggle camera - no local stream (viewer mode?)');
      setIsCameraOn(false);
    }
  }, [isCameraOn]);

  /**
   * Toggle remote audio mute (client-side only, doesn't affect WebRTC connection)
   * Controls the enabled state of remote audio tracks
   */
  const toggleRemoteAudioMute = useCallback(() => {
    if (remoteStream) {
      const audioTracks = remoteStream.getAudioTracks();
      const newMutedState = !isRemoteAudioMuted;
      
      audioTracks.forEach((track) => {
        track.enabled = !newMutedState;
      });
      
      setIsRemoteAudioMuted(newMutedState);
      console.log('WebRTC: Remote audio toggled', { muted: newMutedState });
    } else {
      console.warn('WebRTC: Cannot toggle remote audio - no remote stream');
    }
  }, [remoteStream, isRemoteAudioMuted]);

  /**
   * Enable local media (camera/mic) for two-way communication
   * This transitions from viewer mode to full two-way mode
   */
  const enableLocalMedia = useCallback(async () => {
    if (localStreamRef.current) {
      console.log('WebRTC: Local media already enabled');
      return;
    }

    if (!peerConnectionRef.current) {
      console.error('WebRTC: Cannot enable local media - peer connection not initialized');
      return;
    }

    const trackCountsBefore = {
      localTracks: 0,
      senderTracks: peerConnectionRef.current.getSenders().filter((sender) => !!sender.track).length,
    };
    let enableSucceeded = false;
    console.log('rtc_audit.enable_local_media_start', {
      sessionId,
      currentUserId,
      trackCountsBefore,
      makingOffer: makingOfferRef.current,
    });

    try {
      console.log('WebRTC: Enabling local media (transitioning from viewer mode)');
      setConnectionState('connecting');

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log('WebRTC: ✅ Got user media for two-way communication');
      } catch (err: any) {
        if (err?.name === 'NotReadableError' || err?.name === 'NotAllowedError') {
          console.warn('WebRTC: Camera blocked, falling back to audio-only');
          stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
        } else {
          throw err;
        }
      }

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsMicOn(true);
      setIsCameraOn(stream.getVideoTracks().length > 0);
      setIsViewerMode(false);

      // Add tracks to existing peer connection
      stream.getTracks().forEach((track) => {
        peerConnectionRef.current?.addTrack(track, stream);
      });

      // Always renegotiate after adding local tracks, regardless of initiator.
      // Otherwise, the remote peer will never receive the new media when the coach
      // enables camera/mic (especially when the coach is not the initial initiator).
      if (peerConnectionRef.current.signalingState === 'stable' && channelRef.current && subscribedStatusRef.current === 'SUBSCRIBED') {
        const otherUserId = remoteUserIdRef.current;
        if (otherUserId && otherUserId !== currentUserId) {
          console.log('WebRTC: Creating renegotiation offer with local media tracks');
          makingOfferRef.current = true;
          try {
            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);

            const messageId = crypto.randomUUID();
            const sendResult = await channelRef.current.send({
              type: 'broadcast',
              event: 'signal',
              payload: {
                id: messageId,
                type: 'offer',
                offer: offer,
                from: currentUserId,
                to: otherUserId,
              },
            });
            if (sendResult !== 'ok') {
              throw new Error(`Renegotiation offer send failed with status: ${sendResult}`);
            }
            offerSentRef.current = true;
            offerSentCountRef.current++;
            lastSignalSentAtRef.current = Date.now();
            console.log('WebRTC: SEND offer (renegotiation)', { currentUserId, otherUserId, messageId, sendResult });
          } catch (error) {
            offerSentRef.current = false;
            const activePc = peerConnectionRef.current;
            if (activePc && activePc.signalingState === 'have-local-offer') {
              try {
                await activePc.setLocalDescription({ type: 'rollback' });
              } catch {
                // no-op
              }
            }
            throw error;
          } finally {
            makingOfferRef.current = false;
          }
        } else {
          console.warn('WebRTC: Cannot renegotiate - missing or invalid otherUserId', { currentUserId, otherUserId });
        }
      } else {
        console.warn('WebRTC: Cannot renegotiate - signaling not ready', {
          signalingState: peerConnectionRef.current.signalingState,
          hasChannel: !!channelRef.current,
          status: subscribedStatusRef.current,
        });
      }

      console.log('WebRTC: ✅ Local media enabled successfully');
      enableSucceeded = true;
    } catch (error: any) {
      console.error('WebRTC: ❌ Error enabling local media:', error);
      setConnectionState('failed');
    } finally {
      const pc = peerConnectionRef.current;
      const trackCountsAfter = {
        localTracks: localStreamRef.current?.getTracks().length ?? 0,
        senderTracks: pc ? pc.getSenders().filter((sender) => !!sender.track).length : 0,
      };
      console.log('rtc_audit.enable_local_media_end', {
        sessionId,
        currentUserId,
        success: enableSucceeded,
        trackCountsBefore,
        trackCountsAfter,
        makingOffer: makingOfferRef.current,
      });
    }
  }, [currentUserId, sessionId]);

  // Sync mute state when remote stream changes
  useEffect(() => {
    if (remoteStream && isRemoteAudioMuted) {
      const audioTracks = remoteStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = false;
      });
    }
  }, [remoteStream, isRemoteAudioMuted]);

  const endCall = useCallback(() => {
    setupGenerationRef.current++;
    // Complete cleanup: Stop all media tracks first
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    // Close data channel explicitly
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch (error) {
        console.error('Error closing data channel:', error);
      }
      dataChannelRef.current = null;
    }
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    // Unsubscribe from Supabase Realtime channel
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    localStreamRef.current = null;
    remoteUserIdRef.current = null;
    joinSentRef.current = false;
    offerSentRef.current = false;
    hasReceivedOfferRef.current = false;
    answerAppliedRef.current = false;
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    iceCandidateQueueRef.current = [];
    subscribedStatusRef.current = null;
    processedMessageIdsRef.current.clear();
    signalingChannelNameRef.current = null;
    isRestartingIceRef.current = false;
    lastIceRestartAtRef.current = null;
    signalingModeRef.current = 'validated';
    negotiationBlockedRef.current = false;
    failureReasonRef.current = null;
    isRejoiningChannelRef.current = false;
    signalBroadcastHandlerRef.current = null;
    channelStatusHandlerRef.current = null;
    setIsMicOn(false);
    setIsCameraOn(false);
    setIsViewerMode(initialViewerModeRef.current);
    setConnectionState('disconnected');
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const retry = useCallback(() => {
    endCall();
    // Reset flags for retry
    hasReceivedOfferRef.current = false;
    remoteUserIdRef.current = null;
    joinSentRef.current = false;
    offerSentRef.current = false;
    answerAppliedRef.current = false;
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    iceCandidateQueueRef.current = [];
    iceSentCountRef.current = 0;
    iceRecvCountRef.current = 0;
    joinRecvCountRef.current = 0;
    offerSentCountRef.current = 0;
    offerRecvCountRef.current = 0;
    answerSentCountRef.current = 0;
    answerRecvCountRef.current = 0;
    lastSignalSentAtRef.current = null;
    lastSignalRecvAtRef.current = null;
    subscribedStatusRef.current = null;
    lastIceRestartAtRef.current = null;
    processedMessageIdsRef.current.clear();
    signalingModeRef.current = 'validated';
    negotiationBlockedRef.current = false;
    failureReasonRef.current = null;
    isRejoiningChannelRef.current = false;
    signalBroadcastHandlerRef.current = null;
    channelStatusHandlerRef.current = null;
    setTimeout(() => {
      setupPeerConnection().catch((error) => {
        console.error('Failed to retry connection:', error);
        setConnectionState('failed');
      });
    }, 500);
  }, [endCall, setupPeerConnection]);

  const sendMessage = useCallback((text: string) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'message', text }));
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: 'local',
          text,
          timestamp: new Date(),
        },
      ]);
    }
  }, []);

  return {
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
  };
}
