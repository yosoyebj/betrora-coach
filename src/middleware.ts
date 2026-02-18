import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl?.trim() || !supabaseKey?.trim()) {
    if (request.nextUrl.pathname === "/login") {
      return NextResponse.next({ request: { headers: request.headers } });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "config");
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: any) {
          request.cookies.set({
            name,
            value: "",
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: "",
            ...options,
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect coach routes
  if (request.nextUrl.pathname.startsWith("/dashboard") ||
      request.nextUrl.pathname.startsWith("/inbox") ||
      request.nextUrl.pathname.startsWith("/clients") ||
      request.nextUrl.pathname.startsWith("/sessions") ||
      request.nextUrl.pathname.startsWith("/room") ||
      request.nextUrl.pathname.startsWith("/availability") ||
      request.nextUrl.pathname.startsWith("/progress") ||
      request.nextUrl.pathname.startsWith("/profile")) {
    
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Check for impersonation in URL params (magic link redirect)
    const impersonationId = request.nextUrl.searchParams.get("impersonation_id");
    const targetType = request.nextUrl.searchParams.get("target_type");
    const isImpersonatingCoach = impersonationId && targetType === "coach";

    // Check if user is a coach (or being impersonated as a coach)
    const { data: coach } = await supabase
      .from("coaches")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!coach && !isImpersonatingCoach) {
      // User is authenticated but not a coach and not being impersonated as a coach
      return NextResponse.redirect(new URL("/login?error=not_coach", request.url));
    }
  }

  // Redirect authenticated coaches away from login
  if (request.nextUrl.pathname === "/login" && user) {
    const { data: coach } = await supabase
      .from("coaches")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (coach) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

