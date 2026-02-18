import { createBrowserClient } from "@supabase/ssr";

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;
type SupabaseGlobal = typeof globalThis & {
  __betroraCoachSupabaseClient?: SupabaseBrowserClient;
};

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase env vars. Please check your .env.local file.");
  }

  const globalScope = globalThis as SupabaseGlobal;

  // Reuse a single browser client across module reloads and import variants.
  if (!globalScope.__betroraCoachSupabaseClient) {
    globalScope.__betroraCoachSupabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  return globalScope.__betroraCoachSupabaseClient;
}
