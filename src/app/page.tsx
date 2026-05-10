import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { error } = await supabase.auth.getSession();
  const connected = !error;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Stable State
      </h1>
      <p className="text-lg text-zinc-500 dark:text-zinc-400">
        Lesson &amp; horse management app
      </p>
      <div className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm">
        <span
          className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-yellow-400"}`}
        />
        <span className="text-zinc-600 dark:text-zinc-300">
          {connected ? "Supabase connected" : "Supabase env vars not set — add .env.local"}
        </span>
      </div>
    </main>
  );
}
