import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function verifyCoachAndSubscription(
  supabaseWithAuth: ReturnType<typeof createClient>,
  user_id: string,
) {
  type CoachRow = { id: string };
  // Get the current user
  const {
    data: { user },
    error: authError,
  } = await supabaseWithAuth.auth.getUser();

  if (authError || !user) {
    return { error: "Unauthorized", coachId: null };
  }

  // Get coach record by user_id
  const { data: coach, error: coachError } = await supabaseWithAuth
    .from("coaches")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle<CoachRow>();

  if (coachError || !coach) {
    return { error: "Coach not found or unauthorized", coachId: null };
  }

  const coachId = coach.id;

  // Verify active subscription exists
  const { data: subscription, error: subscriptionError } = await supabaseWithAuth
    .from("coach_subscriptions")
    .select("id")
    .eq("user_id", user_id)
    .eq("coach_id", coachId)
    .eq("status", "active")
    .maybeSingle();

  if (subscriptionError || !subscription) {
    return { error: "Active subscription not found", coachId: null };
  }

  return { error: null, coachId };
}

export async function GET(request: NextRequest) {
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

    // Get user_id from query params
    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get("user_id");

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id query parameter is required" },
        { status: 400 }
      );
    }

    // Verify coach and subscription
    const { error: verifyError, coachId } = await verifyCoachAndSubscription(
      supabaseWithAuth,
      user_id,
    );

    if (verifyError || !coachId) {
      return NextResponse.json({ error: verifyError }, { status: 403 });
    }

    // Fetch note by user_id and coach_id
    const { data: note, error: noteError } = await supabaseWithAuth
      .from("coach_notes")
      .select("*")
      .eq("user_id", user_id)
      .eq("coach_id", coachId)
      .maybeSingle();

    if (noteError && noteError.code !== "PGRST116") {
      // PGRST116 is "not found" which is fine
      console.error("Error fetching coach note:", noteError);
      return NextResponse.json(
        { error: noteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ note: note || null });
  } catch (error: any) {
    console.error("Error fetching coach note:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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

    // Parse request body
    const body = await request.json();
    const { user_id, note } = body;

    if (!user_id || note === undefined) {
      return NextResponse.json(
        { error: "user_id and note are required" },
        { status: 400 }
      );
    }

    // Sanitize HTML content - allow only safe formatting tags (preserve closing tags + basic styles)
    const sanitizeHTML = (html: string): string => {
      if (!html || typeof html !== "string") return "";

      const allowedTags = [
        "p",
        "div",
        "br",
        "strong",
        "b",
        "em",
        "i",
        "u",
        "ul",
        "ol",
        "li",
        "span",
        "font",
      ];

      // Remove script + JS handlers
      let sanitized = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/on\w+="[^"]*"/gi, "")
        .replace(/on\w+='[^']*'/gi, "")
        .replace(/javascript:/gi, "");

      // Remove tags NOT in allowlist (keeps both <tag> and </tag>)
      const tagPattern = new RegExp(
        `<(?!/?(${allowedTags.join("|")})\\b)[^>]+>`,
        "gi"
      );
      sanitized = sanitized.replace(tagPattern, "");

      // Strip unsafe styles but keep a small allowlist
      sanitized = sanitized.replace(/style="([^"]*)"/gi, (_m, styles) => {
        const safe = String(styles)
          .split(";")
          .map((s) => s.trim())
          .filter((s) =>
            /^(font-size|font-weight|font-style|text-decoration)\s*:/i.test(s)
          )
          .join("; ");
        return safe ? `style="${safe}"` : "";
      });

      // Convert <font size="..."> into <span style="font-size:...">
      sanitized = sanitized.replace(
        /<font[^>]*size=["']?(\d+)["']?[^>]*>(.*?)<\/font>/gi,
        (_m, size, inner) => {
          const sizeMap: Record<string, string> = {
            "1": "10px",
            "2": "12px",
            "3": "14px",
            "4": "16px",
            "5": "18px",
            "6": "24px",
            "7": "32px",
          };
          return `<span style="font-size:${sizeMap[String(size)] || "14px"};">${inner}</span>`;
        }
      );

      // Limit length (max 50KB)
      if (sanitized.length > 50000) {
        sanitized = sanitized.substring(0, 50000);
      }

      return sanitized;
    };

    const sanitizedNote = sanitizeHTML(note);

    // Verify coach and subscription
    const { error: verifyError, coachId } = await verifyCoachAndSubscription(
      supabaseWithAuth,
      user_id,
    );

    if (verifyError || !coachId) {
      return NextResponse.json({ error: verifyError }, { status: 403 });
    }

    // Upsert note using user_id and coach_id
    const { data: upsertedNote, error: upsertError } = await supabaseWithAuth
      .from("coach_notes")
      .upsert(
        {
          user_id,
          coach_id: coachId,
          note: sanitizedNote || "",
        },
        {
          onConflict: "user_id,coach_id",
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error("Error upserting coach note:", upsertError);
      return NextResponse.json(
        { error: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ note: upsertedNote });
  } catch (error: any) {
    console.error("Error upserting coach note:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
