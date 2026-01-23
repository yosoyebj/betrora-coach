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

    const { data: coach } = await supabaseWithAuth
      .from("coaches")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!coach) {
      return NextResponse.json(
        { error: "Only coaches can view availability" },
        { status: 403 }
      );
    }

    const { data: availability, error } = await supabaseWithAuth
      .from("coach_availability")
      .select("*")
      .eq("coach_id", coach.id)
      .eq("is_active", true)
      .order("day_of_week", { ascending: true })
      .order("start_time_minutes", { ascending: true });

    if (error) {
      console.error("Error fetching availability:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ availability: availability || [] });
  } catch (error: any) {
    console.error("Error fetching coach availability:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const { data: coach } = await supabaseWithAuth
      .from("coaches")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!coach) {
      return NextResponse.json(
        { error: "Only coaches can manage availability" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { day_of_week, start_time_minutes, end_time_minutes, timezone } = body;

    if (
      day_of_week === undefined ||
      start_time_minutes === undefined ||
      end_time_minutes === undefined
    ) {
      return NextResponse.json(
        { error: "day_of_week, start_time_minutes, and end_time_minutes are required" },
        { status: 400 }
      );
    }

    const { data: availability, error } = await supabaseWithAuth
      .from("coach_availability")
      .insert({
        coach_id: coach.id,
        day_of_week,
        start_time_minutes,
        end_time_minutes,
        timezone: timezone || "UTC",
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating availability:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, availability });
  } catch (error: any) {
    console.error("Error creating coach availability:", error);
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

    const { data: coach } = await supabaseWithAuth
      .from("coaches")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!coach) {
      return NextResponse.json(
        { error: "Only coaches can manage availability" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    // Verify coach owns this availability
    const { data: existing } = await supabaseWithAuth
      .from("coach_availability")
      .select("coach_id")
      .eq("id", id)
      .single();

    if (!existing || existing.coach_id !== coach.id) {
      return NextResponse.json(
        { error: "Availability not found or unauthorized" },
        { status: 404 }
      );
    }

    const { data: updated, error } = await supabaseWithAuth
      .from("coach_availability")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating availability:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, availability: updated });
  } catch (error: any) {
    console.error("Error updating coach availability:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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

    const { data: coach } = await supabaseWithAuth
      .from("coaches")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!coach) {
      return NextResponse.json(
        { error: "Only coaches can manage availability" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    // Verify coach owns this availability
    const { data: existing } = await supabaseWithAuth
      .from("coach_availability")
      .select("coach_id")
      .eq("id", id)
      .single();

    if (!existing || existing.coach_id !== coach.id) {
      return NextResponse.json(
        { error: "Availability not found or unauthorized" },
        { status: 404 }
      );
    }

    const { error } = await supabaseWithAuth
      .from("coach_availability")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting availability:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting coach availability:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
