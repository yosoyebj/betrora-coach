import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import useSWR from "swr";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

export function useSupabaseAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      setState({
        session: data.session,
        user: data.session?.user ?? null,
        loading: false,
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        session: session,
        user: session?.user ?? null,
        loading: false,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

async function fetchCoach() {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data, error } = await supabase
    .from("coaches")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error loading coach", error);
    return null;
  }

  return data;
}

export function useCoachRole() {
  const { data, error, isLoading } = useSWR("coach-role", fetchCoach, {
    revalidateOnFocus: true,
  });

  return {
    coach: data,
    isCoach: Boolean(data),
    loading: isLoading,
    error,
  };
}

