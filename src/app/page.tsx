import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/session";

export default async function Home() {
  const context = await getCurrentUserContext();

  if (context.isSignedIn) {
    redirect("/dashboard");
  }

  redirect("/login");
}
