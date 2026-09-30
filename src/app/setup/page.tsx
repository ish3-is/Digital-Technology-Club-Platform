import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { identity } from "@/lib/services";
import { AuthPage } from "@/components/auth-page";
export default async function Page() {
  const ctx = await identity(await headers(), true).catch(() => null);
  if (!ctx) redirect("/login");
  if (ctx.user.onboarded) redirect("/");
  return <AuthPage mode="setup" name={ctx.user.name} />;
}
