import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization header required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseWithAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseWithAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is a coach
    const { data: coach } = await supabaseWithAuth
      .from("coaches")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!coach) {
      return NextResponse.json(
        { error: "Only coaches can access sessions" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("id");

    if (sessionId) {
      // 1) Fetch session with coach info
      const { data: session, error } = await supabaseWithAuth
        .from("coach_sessions")
        .select(`
          id,
          user_id,
          coach_id,
          scheduled_at,
          duration_minutes,
          timezone,
          status,
          meeting_link,
          meeting_id,
          meeting_password,
          coach_notes,
          user_notes,
          created_at,
          updated_at,
          coach:coaches(id, user_id, full_name, email, avatar_url)
        `)
        .eq("id", sessionId)
        .eq("coach_id", coach.id)
        .single();

      if (error || !session) {
        console.error("Error fetching session:", error);
        return NextResponse.json(
          { error: "Session not found or unauthorized" },
          { status: 404 }
        );
      }

      // 2) Fetch user profile separately
      const { data: user } = await supabaseWithAuth
        .from("users")
        .select("id, full_name, email")
        .eq("id", session.user_id)
        .maybeSingle();

      return NextResponse.json({ session: { ...session, user } });
    }

    // Fetch all sessions for the coach
    const { data: sessions, error } = await supabaseWithAuth
      .from("coach_sessions")
      .select(`
        id,
        user_id,
        coach_id,
        scheduled_at,
        duration_minutes,
        timezone,
        status,
        meeting_link,
        meeting_id,
        meeting_password,
        coach_notes,
        user_notes,
        created_at,
        updated_at
      `)
      .eq("coach_id", coach.id)
      .order("scheduled_at", { ascending: false });

    if (error) {
      console.error("Error fetching sessions:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Fetch user details separately
    const userIds = [...new Set(sessions?.map((s: any) => s.user_id).filter(Boolean))];
    let userMap = new Map();
    if (userIds.length > 0) {
      const { data: users } = await supabaseWithAuth
        .from("users")
        .select("id, full_name, email")
        .in("id", userIds);
      
      userMap = new Map(users?.map((u: any) => [u.id, u]) || []);
    }

    // Map users to sessions
    const sessionsWithUsers = sessions?.map((session: any) => ({
      ...session,
      user: userMap.get(session.user_id) || null,
    })) || [];

    return NextResponse.json({ sessions: sessionsWithUsers });
  } catch (error: any) {
    console.error("Error fetching coach sessions:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization header required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseWithAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseWithAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is a coach
    const { data: coach } = await supabaseWithAuth
      .from("coaches")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!coach) {
      return NextResponse.json(
        { error: "Only coaches can update sessions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const sessionId = body.session_id;

    if (!sessionId) {
      return NextResponse.json(
        { error: "session_id is required" },
        { status: 400 }
      );
    }

    // Verify coach owns this session
    const { data: existingSession } = await supabaseWithAuth
      .from("coach_sessions")
      .select("coach_id")
      .eq("id", sessionId)
      .single();

    if (!existingSession || existingSession.coach_id !== coach.id) {
      return NextResponse.json(
        { error: "Session not found or unauthorized" },
        { status: 404 }
      );
    }

    const updateData: any = {};

    if (body.meeting_link !== undefined) {
      updateData.meeting_link = body.meeting_link || null;
    }
    if (body.meeting_id !== undefined) {
      updateData.meeting_id = body.meeting_id || null;
    }
    if (body.meeting_password !== undefined) {
      updateData.meeting_password = body.meeting_password || null;
    }
    if (body.coach_notes !== undefined) {
      updateData.coach_notes = body.coach_notes || null;
    }
    if (body.status === "completed" || body.status === "no_show") {
      updateData.status = body.status;
      if (body.status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }
    }

    const { data: updatedSession, error: updateError } = await supabaseWithAuth
      .from("coach_sessions")
      .update(updateData)
      .eq("id", sessionId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating session:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, session: updatedSession });
  } catch (error: any) {
    console.error("Error updating coach session:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
