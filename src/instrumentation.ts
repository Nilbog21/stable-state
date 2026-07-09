export function register(): void {
  const devSupabaseUrl = process.env.DEV_SUPABASE_URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (devSupabaseUrl && supabaseUrl !== devSupabaseUrl) {
    console.warn(
      `NEXT_PUBLIC_SUPABASE_URL (${supabaseUrl}) does not match DEV_SUPABASE_URL (${devSupabaseUrl}) — check .env.local`
    )
  }
}
