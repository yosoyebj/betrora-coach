import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const rtcSignalingSecret = process.env.RTC_SIGNALING_SECRET || '';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    if (!rtcSignalingSecret) {
      return NextResponse.json({ error: 'RTC signaling secret not configured' }, { status: 500 });
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

    const participants = [session.user_id, coach.user_id].sort();
    const signatureBase = `${sessionId}:${participants[0]}:${participants[1]}`;
    const digest = crypto.createHmac('sha256', rtcSignalingSecret).update(signatureBase).digest('hex').slice(0, 24);
    const channelName = `room:${sessionId}:${digest}`;

    return NextResponse.json(
      {
        channelName,
        sessionId,
        participantId: user.id,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
