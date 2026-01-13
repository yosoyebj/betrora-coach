import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization header required" },
        { status: 401 }
      );
    }

    // Extract the token from the header
    const token = authHeader.replace("Bearer ", "");

    // Create a new Supabase client with the session token
    const supabaseWithAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabaseWithAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { user_id, coach_id, messageContent } = body;

    if (!user_id || !coach_id || !messageContent) {
      return NextResponse.json(
        { error: "user_id, coach_id, and messageContent are required" },
        { status: 400 }
      );
    }

    // Verify the user is the coach
    const { data: coach, error: coachError } = await supabaseWithAuth
      .from("coaches")
      .select("id")
      .eq("id", coach_id)
      .eq("user_id", user.id)
      .single();

    if (coachError || !coach) {
      return NextResponse.json(
        { error: "Coach not found or unauthorized" },
        { status: 403 }
      );
    }

    // Find existing message thread or create a placeholder
    const { data: existingMessage } = await supabaseWithAuth
      .from("coach_messages")
      .select("id")
      .eq("user_id", user_id)
      .eq("coach_id", coach_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Use service role key to bypass RLS for message creation
    // This is safe because we've already verified the coach is authorized
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseServiceKey) {
      console.warn("SUPABASE_SERVICE_ROLE_KEY not set, attempting with auth token");
    }

    const supabaseAdmin = supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        })
      : supabaseWithAuth;

    // Get current timestamp for responded_at
    const now = new Date().toISOString();

    if (existingMessage) {
      // Create a NEW message for the feedback notification (so it shows as unread)
      // This ensures the user gets a notification badge for the new feedback
      // Set coach_response so it appears as a coach message (not user message)
      // Set user_read_at = NULL so it shows as unread
      const { data: newFeedbackMessage, error: insertError } = await supabaseAdmin
        .from("coach_messages")
        .insert({
          user_id: user_id,
          coach_id: coach_id,
          message: "Feedback notification", // Placeholder user message
          coach_response: messageContent, // This makes it appear as a coach message
          responded_at: now, // Set timestamp for coach response
          status: "pending", // Mark as pending so it shows in badge
          user_read_at: null, // NULL means unread - this is what the badge checks
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating feedback message:", insertError);
        return NextResponse.json(
          { error: insertError.message, code: insertError.code },
          { status: 500 }
        );
      }

      console.log("✅ Feedback message created:", {
        id: newFeedbackMessage?.id,
        user_read_at: newFeedbackMessage?.user_read_at,
        has_coach_response: !!newFeedbackMessage?.coach_response,
        status: newFeedbackMessage?.status
      });

      return NextResponse.json({ success: true, message: newFeedbackMessage });
    } else {
      // Create new message thread for feedback notification
      // Set coach_response so it appears as a coach message (not user message)
      // Mark as pending so it shows in the badge as a new unread message
      // Set user_read_at = NULL so it shows as unread
      const { data: newMessage, error: insertError } = await supabaseAdmin
        .from("coach_messages")
        .insert({
          user_id: user_id,
          coach_id: coach_id,
          message: "Feedback notification", // Placeholder user message
          coach_response: messageContent, // This makes it appear as a coach message
          responded_at: now, // Set timestamp for coach response
          status: "pending", // Mark as pending so it shows in badge
          user_read_at: null, // NULL means unread - this is what the badge checks
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating message:", insertError);
        return NextResponse.json(
          { error: insertError.message, code: insertError.code },
          { status: 500 }
        );
      }

      console.log("✅ Feedback message created (new thread):", {
        id: newMessage?.id,
        user_read_at: newMessage?.user_read_at,
        has_coach_response: !!newMessage?.coach_response,
        status: newMessage?.status
      });

      return NextResponse.json({ success: true, message: newMessage });
    }
  } catch (error: any) {
    console.error("Error sending feedback message:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
