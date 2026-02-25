import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/coach-tasks?session_id=&user_id=&coach_id=
 *
 * Returns all coach_tasks for a given session (user_id + coach_id + source='session_room').
 * Caller must be the coach of the session (coaches.user_id = auth user).
 * Uses the service role key so RLS is bypassed server-side.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseWithAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseWithAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get("user_id");
    const coach_id = searchParams.get("coach_id");

    if (!user_id || !coach_id) {
      return NextResponse.json(
        { error: "Missing required query params: user_id, coach_id" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify the requester is indeed the coach
    const { data: coachRow, error: coachErr } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("id", coach_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (coachErr || !coachRow) {
      return NextResponse.json(
        { error: "Forbidden: you are not the coach for this session" },
        { status: 403 }
      );
    }

    const { data: tasks, error } = await supabaseAdmin
      .from("coach_tasks")
      .select("*")
      .eq("user_id", user_id)
      .eq("coach_id", coach_id)
      .eq("source", "session_room")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching coach tasks:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tasks: tasks ?? [] });
  } catch (error: any) {
    console.error("Unexpected error in GET /api/coach-tasks:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getSupabaseAdmin = () =>
  createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/**
 * POST /api/coach-tasks
 *
 * Creates a coach task for a client from within a live session room.
 * Only the coach of the session is permitted to create tasks.
 *
 * Body:
 *   session_id    - the live session UUID (used to verify coach ownership)
 *   user_id       - the client's user UUID (task recipient)
 *   coach_id      - the coach's coaches.id UUID
 *   task_text     - task title/body (required)
 *   task_subtasks - array of step strings (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // Authenticate the requesting user via their bearer token
    const supabaseWithAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseWithAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { session_id, user_id, coach_id, task_text, task_subtasks } = body;

    if (!session_id || !user_id || !coach_id || !task_text?.trim()) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: session_id, user_id, coach_id, task_text",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify the requesting user is the coach for this session:
    // 1. coaches row for coach_id must map back to this user
    // 2. the session must exist with the given ids
    const [{ data: coachRow, error: coachErr }, { data: sessionRow, error: sessionErr }] =
      await Promise.all([
        supabaseAdmin
          .from("coaches")
          .select("id, user_id")
          .eq("id", coach_id)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabaseAdmin
          .from("coach_sessions")
          .select("id, user_id, coach_id")
          .eq("id", session_id)
          .eq("user_id", user_id)
          .eq("coach_id", coach_id)
          .maybeSingle(),
      ]);

    if (coachErr || !coachRow) {
      return NextResponse.json(
        { error: "Forbidden: you are not the coach for this session" },
        { status: 403 }
      );
    }

    if (sessionErr || !sessionRow) {
      return NextResponse.json(
        { error: "Session not found or coach/client mismatch" },
        { status: 403 }
      );
    }

    const validSubtasks = Array.isArray(task_subtasks)
      ? task_subtasks.filter(
          (s: string) => typeof s === "string" && s.trim()
        )
      : null;

    const { data, error } = await supabaseAdmin
      .from("coach_tasks")
      .insert({
        user_id,
        coach_id,
        task_text: task_text.trim(),
        task_subtasks:
          validSubtasks && validSubtasks.length > 0 ? validSubtasks : null,
        status: "pending",
        completed_subtasks: [],
        source: "session_room",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating coach task:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ task: data }, { status: 201 });
  } catch (error: any) {
    console.error("Unexpected error in POST /api/coach-tasks:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/coach-tasks
 *
 * Updates task_text and/or task_subtasks for an existing coach task.
 * Only the coach who owns the task (coaches.user_id = auth user) may edit it.
 *
 * Body: { id, task_text?, task_subtasks? }
 */
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseWithAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseWithAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, task_text, task_subtasks } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing task id" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify the requester is the coach who owns this task
    const { data: taskRow, error: taskErr } = await supabaseAdmin
      .from("coach_tasks")
      .select("id, coach_id")
      .eq("id", id)
      .maybeSingle();

    if (taskErr || !taskRow) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { data: coachRow, error: coachErr } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("id", taskRow.coach_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (coachErr || !coachRow) {
      return NextResponse.json(
        { error: "Forbidden: you do not own this task" },
        { status: 403 }
      );
    }

    const updatePayload: Record<string, unknown> = {};
    if (task_text !== undefined) updatePayload.task_text = task_text.trim();
    if (task_subtasks !== undefined) {
      const valid = Array.isArray(task_subtasks)
        ? task_subtasks.filter((s: string) => typeof s === "string" && s.trim())
        : [];
      updatePayload.task_subtasks = valid.length > 0 ? valid : null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("coach_tasks")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating coach task:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ task: data });
  } catch (error: any) {
    console.error("Unexpected error in PUT /api/coach-tasks:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/coach-tasks?id=<task-uuid>
 *
 * Deletes a coach task. Only the owning coach may delete it.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseWithAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseWithAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing task id" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify the requester is the coach who owns this task
    const { data: taskRow, error: taskErr } = await supabaseAdmin
      .from("coach_tasks")
      .select("id, coach_id")
      .eq("id", id)
      .maybeSingle();

    if (taskErr || !taskRow) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { data: coachRow, error: coachErr } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("id", taskRow.coach_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (coachErr || !coachRow) {
      return NextResponse.json(
        { error: "Forbidden: you do not own this task" },
        { status: 403 }
      );
    }

    const { error } = await supabaseAdmin
      .from("coach_tasks")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting coach task:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Unexpected error in DELETE /api/coach-tasks:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
