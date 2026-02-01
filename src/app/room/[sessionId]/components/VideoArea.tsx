'use client';

import { useEffect, useRef } from 'react';
import { ConnectionState } from '../hooks/useWebRTC';

interface VideoAreaProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCameraOn: boolean;
  otherPersonName: string;
  connectionState: ConnectionState;
}

export default function VideoArea({
  localStream,
  remoteStream,
  isCameraOn,
  otherPersonName,
  connectionState,
}: VideoAreaProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
      {/* Remote Video (Main) */}
      {remoteStream ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-center p-8">
          <div className="w-24 h-24 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
            <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-white/60 text-lg font-medium">Waiting for {otherPersonName}...</p>
          {connectionState === 'connecting' && (
            <p className="text-white/40 text-sm mt-2">Connecting...</p>
          )}
        </div>
      )}

      {/* Local Video Preview (Bottom Right) */}
      {localStream && (
        <div className="absolute bottom-4 right-4 w-48 h-36 rounded-lg overflow-hidden border-2 border-white/20 bg-slate-900 shadow-2xl">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${!isCameraOn ? 'opacity-50' : ''}`}
          />
          {!isCameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
              <svg className="w-8 h-8 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
