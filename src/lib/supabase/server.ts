import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requiredEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components can't set cookies (documented Supabase SSR
            // pattern); the middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

// The cookie-based SSR client authenticates PostgREST reads but does NOT attach
// the user's JWT to Storage uploads, so uploads hit RLS as `anon` and fail. For
// owner-scoped writes (storage + inserts), use a client that carries the access
// token explicitly. Pass the token from a getUser()-validated session.
//
// The `accessToken` option is the ONLY reliable way to inject the token: a
// `global.headers.Authorization` gets overridden by supabase-js, which sets the
// Authorization header itself from _getAccessToken() (falling back to the anon
// key when the client has no session).
export function createAuthedClient(accessToken: string) {
  return createSupabaseClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { accessToken: async () => accessToken },
  );
}
