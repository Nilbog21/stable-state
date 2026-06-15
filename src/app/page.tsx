import { createClient } from "@/lib/supabase/server";
import { getBarnMembershipsForUser } from "@/lib/db/barn-memberships";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) redirect("/login");

  const memberships = await getBarnMembershipsForUser(data.user.id);
  const active = memberships.filter((m) => m.membership.status === "active");
  const pending = memberships.filter((m) => m.membership.status === "pending");

  if (active.length === 1) redirect(`/barn/${active[0].barn.slug}`);
  if (active.length > 1) redirect("/barns");
  if (pending.length === 1) redirect(`/barn/${pending[0].barn.slug}/pending`);
  if (pending.length > 1) redirect("/barns");
  redirect("/login?no_barns=true");
}
