import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

/** Fixed channel name; not read from env to avoid secrets in build output. */
const XIRSYS_CHANNEL = 'default';

/**
 * GET /api/ice-servers
 * Returns ICE server configuration for WebRTC peer connections.
 * Uses Xirsys TURN when env vars are set; otherwise returns STUN fallback.
 * Application is derived from request host; channel is fixed (no XIRSYS_* env in build).
 */
export async function GET(request: NextRequest) {
  try {
    const xirsysApiKey = process.env.XIRSYS_API_KEY;
    const xirsysApiSecret = process.env.XIRSYS_API_SECRET;

    if (xirsysApiKey && xirsysApiSecret) {
      const host =
        request.headers.get('x-forwarded-host') ||
        request.headers.get('host') ||
        request.nextUrl?.host ||
        'default';
      const application = host.split(',')[0].trim();

      const url = `https://global.xirsys.net/_turn/${encodeURIComponent(XIRSYS_CHANNEL)}`;
      const body = JSON.stringify({ format: 'urls', application });
      const auth =
        typeof Buffer !== 'undefined'
          ? Buffer.from(`${xirsysApiKey}:${xirsysApiSecret}`).toString('base64')
          : btoa(`${xirsysApiKey}:${xirsysApiSecret}`);

      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${auth}`,
          },
          body,
        });

        if (!response.ok) {
          console.warn(
            '[ice-servers] Xirsys non-200, using fallback:',
            response.status,
            response.statusText
          );
          return NextResponse.json(
            { iceServers: FALLBACK_ICE_SERVERS },
            { headers: { 'Cache-Control': 'no-store' } }
          );
        }

        const data = await response.json();
        const iceServers =
          data?.v?.iceServers ?? data?.d?.iceServers ?? data?.iceServers;
        if (Array.isArray(iceServers) && iceServers.length > 0) {
          return NextResponse.json(
            { iceServers },
            { headers: { 'Cache-Control': 'no-store' } }
          );
        }

        console.warn('[ice-servers] Xirsys response missing iceServers, using fallback');
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown';
        console.warn('[ice-servers] Xirsys request failed, using fallback:', reason);
      }
    }

    return NextResponse.json(
      { iceServers: FALLBACK_ICE_SERVERS },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    console.error('[ice-servers] Error:', reason);
    return NextResponse.json(
      { iceServers: FALLBACK_ICE_SERVERS },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
