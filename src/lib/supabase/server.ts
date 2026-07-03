import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { applyRememberMe } from "./cookie-options";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          const remember =
            cookieStore.get("remember_me")?.value ||
            cookieStore.get("remember_me_pref")?.value;
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, applyRememberMe(options, value, remember))
          );
        },
      },
    }
  );
}
