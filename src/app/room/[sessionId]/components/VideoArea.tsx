'use client';

import { useTracks, VideoTrack, useLocalParticipant } from '@livekit/components-react';
import type { TrackReference, TrackReferenceOrPlaceholder } from '@livekit/components-react';
import { Track } from 'livekit-client';

interface VideoAreaProps {
  otherPersonName: string;
}

function isTrackReference(t: TrackReferenceOrPlaceholder): t is TrackReference {
  return 'publication' in t && t.publication !== undefined;
}

export default function VideoArea({ otherPersonName }: VideoAreaProps) {
  const { isCameraEnabled } = useLocalParticipant();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);

  const remoteTrack = tracks.find((t): t is TrackReference => isTrackReference(t) && !t.participant.isLocal);
  const localTrack = tracks.find((t): t is TrackReference => isTrackReference(t) && t.participant.isLocal);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
      {/* Remote Video (Main) */}
      {remoteTrack ? (
        <VideoTrack trackRef={remoteTrack} className="w-full h-full object-cover" />
      ) : (
        <div className="flex flex-col items-center justify-center text-center p-8">
          <div className="w-24 h-24 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
            <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="text-white/60 text-lg font-medium">Waiting for {otherPersonName}...</p>
        </div>
      )}

      {/* Local Video Preview (PIP – bottom right) */}
      {localTrack && (
        <div className="absolute bottom-4 right-4 w-48 h-36 rounded-lg overflow-hidden border-2 border-white/20 bg-slate-900 shadow-2xl">
          <VideoTrack
            trackRef={localTrack}
            className={`w-full h-full object-cover ${!isCameraEnabled ? 'opacity-50' : ''}`}
            style={{ transform: 'scaleX(-1)' }}
          />
          {!isCameraEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
              <svg className="w-8 h-8 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
