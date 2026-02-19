import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AccessToken } from 'livekit-server-sdk';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
// Trim to avoid "invalid token" from accidental whitespace in .env
const livekitApiKey = (process.env.LIVEKIT_API_KEY || '').trim();
const livekitApiSecret = (process.env.LIVEKIT_API_SECRET || '').trim();
const livekitUrl = (process.env.LIVEKIT_URL || '').trim();

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
      return NextResponse.json(
        { error: 'LiveKit not configured – set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 });
    }

    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: session, error: sessionError } = await supabase
      .from('coach_sessions')
      .select('id, user_id, coach_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { data: coach, error: coachError } = await supabase
      .from('coaches')
      .select('id, user_id')
      .eq('id', session.coach_id)
      .single();

    if (coachError || !coach?.user_id) {
      return NextResponse.json({ error: 'Coach identity missing for session' }, { status: 400 });
    }

    const isParticipant = user.id === session.user_id || user.id === coach.user_id;
    if (!isParticipant) {
      return NextResponse.json({ error: 'Forbidden: not a session participant' }, { status: 403 });
    }

    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      ttl: '2h',
    });

    at.addGrant({
      roomJoin: true,
      room: sessionId,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    const body: { token: string; serverUrl: string; _debug?: { serverTimeUtc: string } } = {
      token,
      serverUrl: livekitUrl,
    };
    if (process.env.NODE_ENV === 'development') {
      body._debug = { serverTimeUtc: new Date().toISOString() };
    }

    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
