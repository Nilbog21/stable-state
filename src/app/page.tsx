import { createClient } from "@/lib/supabase/server";
import { getBarnMembershipsForUser } from "@/lib/db/barn-memberships";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const connected = !error;

  if (data?.user) {
    const memberships = await getBarnMembershipsForUser(data.user.id);
    const active = memberships.filter((m) => m.membership.status === "active");
    const pending = memberships.filter((m) => m.membership.status === "pending");

    if (active.length === 1) redirect(`/barn/${active[0].barn.slug}`);
    if (active.length > 1) redirect("/barns");
    if (pending.length === 1) redirect(`/barn/${pending[0].barn.slug}/pending`);
    if (pending.length > 1) redirect("/barns");
    redirect("/login?no_barns=true");
  }

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
