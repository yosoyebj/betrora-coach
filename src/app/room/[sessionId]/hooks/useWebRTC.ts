'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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
          client = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          });
          console.log('WebRTC: Initialized authenticated Supabase client for signaling');
        } else {
          client = createClient(supabaseUrl, supabaseAnonKey);
          console.warn('WebRTC: No token available, using unauthenticated client');
        }
      } catch (error) {
        console.error('Error getting session token, using unauthenticated client:', error);
        client = createClient(supabaseUrl, supabaseAnonKey);
      }
    } else {
      try {
        const supabaseBrowser = createSupabaseBrowserClient();
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (session?.access_token) {
          client = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            },
          });
          console.log('WebRTC: Initialized authenticated Supabase client from browser session');
        } else {
          client = createClient(supabaseUrl, supabaseAnonKey);
          console.warn('WebRTC: No session found, using unauthenticated client');
        }
      } catch (error) {
        console.error('Error getting browser session, using unauthenticated client:', error);
        client = createClient(supabaseUrl, supabaseAnonKey);
      }
    }

    supabaseRef.current = client;
    return client;
  }, [sessionToken]);

  // Initialize Supabase client early, but setup also hard-requires it via ensureSupabaseClient().
  useEffect(() => {
    void ensureSupabaseClient();
  }, [ensureSupabaseClient]);

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
        viewerMode: isViewerMode,
        iceServersCount: iceServers.length,
      });

      // Get user media only if not in viewer mode (coach can enable later)
      if (!isViewerMode) {
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
        console.log('WebRTC: ICE connection state changed', {
          iceConnectionState: pc.iceConnectionState,
          connectionState: pc.connectionState,
        });
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
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        dataChannelRef.current = channel;

        channel.onopen = () => {
          console.log('Remote data channel opened');
        };

        channel.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // Only handle chat messages via data channel
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

      // Create data channel for chat (if we're the initiator)
      const dataChannel = pc.createDataChannel('chat', {
        ordered: true,
      });

      dataChannel.onopen = () => {
        console.log('Local data channel opened');
      };

      dataChannel.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Only handle chat messages via data channel
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

      dataChannelRef.current = dataChannel;

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

      const channel = supabaseClient.channel(`room:${sessionId}`, {
        config: {
          broadcast: { self: false },
        },
      });
      channelRef.current = channel;
      console.log('WebRTC: Channel created', {
        sessionId,
        channelName: `room:${sessionId}`,
        timestamp: Date.now(),
      });

        // Helper function to attempt offer creation
        const attemptOfferCreation = async (otherUserId: string, isInitiator?: boolean) => {
          if (isStaleSetup()) return;
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

        channel
          .on('broadcast', { event: 'signal' }, (payload: { payload?: { from?: string; to?: string; id?: string; type?: string; offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }) => {
            // Raw event logging to verify payload structure (log once per event type)
            try {
              const safePayload = {
                type: (payload as any).type,
                event: (payload as any).event,
                payload: payload.payload,
              };
              console.log('RAW SIGNAL EVENT:', JSON.stringify(safePayload, null, 2));
            } catch (e) {
              console.log('RAW SIGNAL EVENT (stringified):', payload);
            }
            
            const { from, to, id: messageId, ...data } = payload.payload || {};
            if (!from) return;
            if (from === currentUserId) return; // Ignore own signals
            if (to && to !== currentUserId) return; // Ignore signals addressed to someone else

            // Deduplicate messages by ID
            if (messageId) {
              if (processedMessageIdsRef.current.has(messageId)) {
                console.log('WebRTC: Ignoring duplicate message', { messageId, type: data.type, from });
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

            lastSignalRecvAtRef.current = Date.now();

            // Track remote user ID from first signal received
            if (!remoteUserIdRef.current && from) {
              remoteUserIdRef.current = from;
              console.log('WebRTC: Discovered remote user ID from signal', { from, currentUserId });
            }

            if (data.type === 'join') {
              joinRecvCountRef.current++;
              console.log('WebRTC: RECV join from', from);
              // Discover remote user ID from join message (always update if different)
              if (from && from !== currentUserId) {
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
            } else if (data.type === 'offer') {
              offerRecvCountRef.current++;
              console.log('WebRTC: RECV offer', { from, currentUserId });
              if (data.offer) {
                handleOffer(data.offer, pc, from, messageId);
              }
            } else if (data.type === 'answer') {
              answerRecvCountRef.current++;
              console.log('WebRTC: RECV answer', { from, currentUserId, messageId });
              if (data.answer) {
                handleAnswer(data.answer, pc, messageId);
              }
            } else if (data.type === 'ice-candidate') {
              handleIceCandidate(data.candidate!, pc);
            }
          })
          .subscribe((status: string) => {
            subscribedStatusRef.current = status;
            console.log('WebRTC: Subscription status changed', {
              status,
              sessionId,
              channelName: `room:${sessionId}`,
              timestamp: Date.now(),
            });
            if (status === 'SUBSCRIBED') {
              console.log('WebRTC: SIGNAL SUBSCRIBED');
              
              // Send join signal immediately to break deadlock
              if (!joinSentRef.current && channelRef.current && subscribedStatusRef.current === 'SUBSCRIBED') {
                try {
                  const messageId = crypto.randomUUID();
                  void channelRef.current.send({
                    type: 'broadcast',
                    event: 'signal',
                    payload: {
                      id: messageId,
                      type: 'join',
                      from: currentUserId,
                      to: remoteUserId || null,
                      ts: Date.now(),
                    },
                  }).then((sendResult: string) => {
                    if (sendResult === 'ok') {
                      joinSentRef.current = true;
                      lastSignalSentAtRef.current = Date.now();
                      console.log('WebRTC: SEND join', { currentUserId, messageId });
                    } else {
                      console.warn('WebRTC: Join send returned non-ok status', { sendResult, messageId });
                    }
                  }).catch((sendError: unknown) => {
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
                console.error('WebRTC: ERROR - otherUserId matches currentUserId! Both users appear to be the same. Check that you are logged in as different users.');
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
          });

      return pc;
    } catch (error: any) {
      console.error('WebRTC: ❌ Error setting up peer connection:', error);
      setConnectionState('failed');
      throw error;
    }
  }, [sessionId, currentUserId, isViewerMode, remoteUserId, ensureSupabaseClient]);

  const handleOffer = async (
    offer: RTCSessionDescriptionInit,
    pc: RTCPeerConnection,
    fromUserId: string,
    messageId?: string
  ) => {
    try {
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
      setIsViewerMode(viewerMode);
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
    };
  }, [sessionId, currentUserId, setupPeerConnection, viewerMode]);

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
        const otherUserId = remoteUserId || remoteUserIdRef.current;
        if (otherUserId && otherUserId !== currentUserId) {
          console.log('WebRTC: Creating renegotiation offer with local media tracks');
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
    } catch (error: any) {
      console.error('WebRTC: ❌ Error enabling local media:', error);
      setConnectionState('failed');
    }
  }, [currentUserId, remoteUserId]);

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
    setIsMicOn(false);
    setIsCameraOn(false);
    setIsViewerMode(viewerMode);
    setConnectionState('disconnected');
    setLocalStream(null);
    setRemoteStream(null);
  }, [viewerMode]);

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
    processedMessageIdsRef.current.clear();
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
