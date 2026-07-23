import { getAuthenticatedUser } from "@/lib/db/auth";
import { getBarnMembershipsForUser } from "@/lib/db/barn-memberships";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getAuthenticatedUser();

  if (!user) redirect("/login");

  const memberships = await getBarnMembershipsForUser(user.id);
  const active = memberships.filter((m) => m.membership.status === "active");

  if (active.length === 1) redirect(`/barn/${active[0].barn.slug}`);
  if (active.length > 1) redirect("/barns");
  redirect("/login?no_barns=true");
}
